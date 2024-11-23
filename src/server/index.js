/* eslint-disable no-param-reassign */
/* eslint-disable import/no-dynamic-require */
/* eslint-disable global-require */
import '@babel/polyfill';
import autoprefixer from 'autoprefixer';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import express from 'express';
import fs from 'fs';
import http from 'http';
import HttpError from 'http-smart-error';
import _ from 'lodash';
import md5 from 'md5';
import mkdirp from 'mkdirp';
import path from 'path';
import postcss from 'postcss';
import RouteParser from 'route-parser';
import Error from 'smart-error';
import Text from 'texting-squirrel';
import uniqid from 'uniqid';

import { WebpackConfig } from './config';
import { BUNDLE_STATUS_ROUTE, CONFIG_ENV_PREFIX, RS_DIR, TSConfig } from './constants';
import Layout from './layout';
import {
	AuthMiddleware,
	BundlingMiddleware,
	CookiesMiddleware,
	ErrorMiddleware,
	LocaleMiddleware,
	PageNotFoundMiddleware,
	RenderMiddleware,
	SessionMiddleware,
} from './middleware';
import Plugin from './plugin';
import Route from './route';
import Session from './session';
import socket, { Socket } from './socket';
import SocketClass from './socket-class';
import StylesCompiler from './styles-compiler';
import Utils from './utils';

const fsAsync = fs.promises;

/**
 * Server part of the application.
 */
class Server {
	/**
	 * @typedef CustomComponent
	 * @property {string} path Absolute path to the component.
	 * @property {string} elementId Identificator of the DOM element where the component should render.
	 * @property {boolean} auto Indicates if the component's wrapper should be automatically rendered in the layout's body.
	 */
	/**
	 * @typedef {import('./').IAppConfig} AppConfig
	 * @typedef {import('./').ISocketEvent} SocketEvent
	 * @typedef {import('./').IMiddleware} IMiddleware
	 */

	// #region Private properties

	/**
	 * Express app instance.
	 * @type {import('express').Express}
	 */
	_app = null;

	/** @type {http.Server} */
	_server = null;

	_webpack = null;

	/** @type {Route[]} */
	_routes = [];

	_routeCallbacks = {};

	_errorPage = null;

	/** @type {AppConfig} */
	_config = {
		port: 8080,
		staticDir: './public',
		dev: false,
		jsDir: 'js',
		cssDir: 'css',
		filename: 'bundle.js',
		appDir: './app',
		entryFile: null,
		rsConfig: null,
		layoutComponent: Layout,
		cookieSecret: null,
		cookies: {
			secret: Math.random().toString(36).substring(7),
			secure: null,
			httpOnly: null,
			domain: null,
			sameSite: null,
		},
		scripts: [],
		styles: [],
		mergeStyles: [],
		session: Session,
		socketMessageMaxSize: 2 ** 20 * 100,
		auth: (session, next) => next(),
		error: {},
		// errorHandler: (err, req, res, next) => next(),
		bundlePathRelative: false,
		onWebpackProgress: null,
		webpack: {},
		socketIO: {},
		autoprefixer: {},
		babelTranspileModules: [],
		createMissingComponents: false,
		generatedComponentsExtension: 'tsx',
		moduleDev: false,
		sourceStylesDir: null,
		connectSocketAutomatically: true,
		locale: {
			default: 'en-US',
			accepted: [],
		},
		logging: true,
		bundleAfterServerStart: false,
		getInitialData: () => ({}),
		getTitle: () => null,
		tsCompilerOptions: {},
		envVars: {},
	};

	/**
	 * Absolute path to the javascript directory for the webpack config.
	 * @type {string}
	 */
	_path = null;

	/**
	 * Bundle path in the website structure.
	 * @type {string}
	 */
	_bundlePath = null;

	_version = null;

	/** @type {SocketEvent[]} */
	_socketEvents = [];

	_socketClasses = [];

	/** @type {CustomComponent[]} */
	_components = [];

	_componentProvider = null;

	_componentErrorHandler = null;

	_rsConfig = null;

	_beforeExecution = [];

	_nonce = Buffer.from(uniqid()).toString('base64');

	_entryInjections = [];

	_plugins = [];

	/** @type {IMiddleware[]} */
	_middlewares = [];

	_bundling = true;

	_rsFiles = [];

	_bundlingStatus = 0;

	// #endregion

	// #region Property getters

	/**
	 * Port on which the server listens.
	 * @type {number}
	 */
	get port() {
		return this._config.port;
	}

	/**
	 * Relative path to the static directory for the express app.
	 * @type {string}
	 */
	get staticDir() {
		return this._config.staticDir;
	}

	/**
	 * Absolute path to the static directory for the express app.
	 * @type {string}
	 */
	get staticDirAbsolute() {
		return path.resolve(this.staticDir);
	}

	/**
	 * Flag of the dev status of the app.
	 * @type {boolean}
	 */
	get dev() {
		return this._config.dev;
	}

	/**
	 * Absolute path to the javascript directory for the webpack config.
	 * @type {string}
	 */
	get path() {
		return this._path;
	}

	/**
	 * Bundle path in the website structure.
	 * @type {string}
	 */
	get bundlePath() {
		return this._bundlePath;
	}

	/**
	 * Absolute path to the bundle file in the application structure.
	 * @type {string}
	 */
	get bundlePathAbsolute() {
		const { staticDir, jsDir, filename } = this._config;
		return path.resolve(staticDir, jsDir, filename);
	}

	/**
	 * Relative path to the application directory.
	 * @type {string}
	 */
	get appDir() {
		return this._config.appDir;
	}

	/**
	 * Absolute path to the application directory.
	 * @type {string}
	 */
	get appDirAbsolute() {
		return path.resolve(this.appDir);
	}

	/**
	 * JSX element for the layout component
	 * @type {JSX.Element}
	 */
	get Layout() {
		return this._config.layoutComponent;
	}

	/**
	 * Object of the session.
	 * @type {function}
	 */
	get Session() {
		return this._config.session;
	}

	get nonce() {
		return this._nonce;
	}

	get Text() {
		return Text;
	}

	get version() {
		return this._version;
	}

	get bundling() {
		return this._bundling;
	}

	// #endregion

	/**
	 * Creates the instance of the server and prepares express app with socket.io.
	 *
	 * @param {AppConfig} config
	 */
	constructor(config = {}) {
		try {
			this._rsConfig = require(config.rsConfig || path.resolve('./rsconfig.json'));
		} catch (e) {
			if (config.rsConfig) {
				throw e;
			}
		}
		if (!config.cookies || !config.cookies.secret) {
			if (config.cookieSecret) {
				// eslint-disable-next-line no-param-reassign
				config.cookies = { secret: config.cookieSecret };
			} else if (config.logging !== false) {
				this._warn(
					"Using default cookie secret. It's a random string which changes every server start. It should be overriden in config.",
				);
			}
		}
		this._createConfig(config);
		if (this._config.errorHandler && this._config.error.handler) {
			this._warn('Specified deprecated errorHandler with error.handler. Deprecated handler will be ignored.');
		} else if (this._config.errorHandler) {
			this._config.error.handler = this._config.errorHandler;
		}
		if (!(this._config.locale.accepted instanceof Array)) {
			this._config.locale.accepted = [];
		}
		if (!this._config.locale.accepted.includes(this._config.locale.default)) {
			this._config.locale.accepted.unshift(this._config.locale.default);
		}
		if (!this._config.sourceStylesDir) {
			this._warn(
				"Using default sourceStylesDir. It's in the express static directory and all sources are accessible over the http.",
			);
			this._config.sourceStylesDir = path.resolve(`${this._config.staticDir}/${this._config.cssDir}`);
		} else {
			this._config.sourceStylesDir = !path.isAbsolute(this._config.sourceStylesDir)
				? path.resolve(this._config.sourceStylesDir)
				: this._config.sourceStylesDir;
		}
		if (typeof this._config.cookies.httpOnly === 'boolean') {
			this._warn('Using httpOnly option of the cookies is deprecated. By default the option is always true.');
		}
		if (!(new this.Session() instanceof Session)) {
			throw new Error('Cannot create instance of Session.');
		}
		if (!(new this.Layout() instanceof Layout)) {
			throw new Error('Cannot create instance of Layout.');
		}
		this._path = path.resolve(`${this._config.staticDir}/${this._config.jsDir}`);
		this._bundlePath = `${this._config.bundlePathRelative ? '' : '/'}${this._config.jsDir}/${
			this._config.filename
		}`;
		const pkg = require(path.resolve('./package.json'));
		this._version = pkg.version;
		this._setApp();
		this._log('Server created', this._config);
	}

	// #region Getters

	/**
	 * Gets the http server.
	 *
	 * @returns {http.Server}
	 */
	getServer() {
		return this._server;
	}

	getApp() {
		return this._app;
	}

	getConfig(key = null) {
		return key ? this._config[key] : this._config;
	}

	getLocaleFileName(locale) {
		if (this.isLocaleDefault(locale)) {
			return 'text.json';
		}
		return `text_${locale}.json`;
	}

	getLocaleText(locale, key, ...args) {
		return this._getLocaleText(locale, key, ...args);
	}

	getRegisteredComponents() {
		return this._components;
	}

	/**
	 * Gets the list of registered socket events.
	 *
	 * @returns {SocketEvent[]}
	 */
	getSocketEvents() {
		return this._socketEvents;
	}

	/**
	 * Gets the list of registered socket classes.
	 *
	 * @returns {SocketClass[]}
	 */
	getSocketClasses() {
		return this._socketClasses;
	}

	getPluginByName(name) {
		return this._plugins.find((plugin) => plugin.getName() === name);
	}

	// #endregion

	// #region Setters

	// #endregion

	isLocaleDefault(locale) {
		return locale === this._config.locale.default;
	}

	/**
	 * Calls the auth function from the config.
	 *
	 * @param {Session} session
	 * @param {function} next
	 */
	auth(session, next) {
		const { auth } = this._config;
		if (typeof auth === 'function') {
			auth(session, next);
		}
	}

	updateBundlingStatus(percentage) {
		this._bundlingStatus = percentage;
	}

	// #region Registers

	/**
	 * Registers the route.
	 *
	 * @param {'get'|'post'|'put'|'delete'} method HTTP method of the route.
	 * @param {string} route Route spec.
	 * @param {string} contentComponent Absolute path or relative path from the {config.appDir} to the component.
	 * @param {string} title Title of the page.
	 * @param {boolean=} requireAuth If true the route requires authorized user.
	 * @param {any} layout Alternative layout.
	 * @param {function=} callback Callback to call when the route is called.
	 */
	registerRoute(method, route, contentComponent, title, requireAuth, layout, callback) {
		if (typeof requireAuth === 'function') {
			callback = requireAuth;
			requireAuth = false;
			layout = null;
		}
		if (typeof layout === 'function') {
			try {
				// eslint-disable-next-line new-cap
				if (!(new layout() instanceof Layout)) {
					callback = layout;
					layout = null;
				}
			} catch (e) {
				callback = layout;
				layout = null;
			}
		}
		this._routes.push(new Route(method, route, contentComponent, title, requireAuth, layout, callback));
		return this;
	}

	registerRouteCallback(method, route, callback) {
		if (typeof route === 'function') {
			callback = route;
			route = method;
			method = 'get';
		}
		const key = `${method || 'get'} ${route}`;
		this._routeCallbacks[key] = {
			method,
			route,
			callback,
		};
		return this;
	}

	/**
	 * Registers the socket class to handle socket events.
	 *
	 * @param {function} Cls Class inherited from SocketClass.
	 */
	registerSocketClass(Cls) {
		const instance = new Cls();
		if (!(instance instanceof SocketClass)) {
			throw new Error(`${Cls} must be inherited from SocketClass`);
		}
		instance.getEvents().forEach(({ event, listener }) => this.registerSocketEvent(event, listener));
		this._socketClasses.push(instance);
		return this;
	}

	/**
	 * Registers the socket event.
	 *
	 * @param {string} event Name of the event.
	 * @param {function} listener Listener to call after the socket request.
	 */
	registerSocketEvent(event, listener) {
		this._socketEvents.push({ event, listener });
		return this;
	}

	registerComponent(componentPath, elementId, auto = false) {
		const { appDir } = this._config;
		this._components.push({
			path: !path.isAbsolute(componentPath) ? path.resolve(`${appDir}/${componentPath}`) : componentPath,
			elementId,
			auto,
		});
		return this;
	}

	registerComponentProvider(componentPath) {
		const { appDir } = this._config;
		this._componentProvider = !path.isAbsolute(componentPath)
			? path.resolve(`${appDir}/${componentPath}`)
			: componentPath;
		return this;
	}

	registerComponentErrorHandler(componentPath) {
		const { appDir } = this._config;
		this._componentErrorHandler = !path.isAbsolute(componentPath)
			? path.resolve(`${appDir}/${componentPath}`)
			: componentPath;
		return this;
	}

	registerErrorPage(componentPath) {
		const { appDir } = this._config;
		this._errorPage = path.resolve(`${appDir}/${componentPath}`);
		return this;
	}

	registerBeforeExecution(spec, callback) {
		// eslint-disable-next-line no-shadow
		const index = this._beforeExecution.map(({ spec }) => spec).indexOf(spec);
		if (index >= 0) {
			this._warn(`Before execution callback for '${spec}' is already registered. Rewriting.`);
			this._beforeExecution.splice(index, 1);
		}
		this._beforeExecution.push({ spec, callback });
		return this;
	}

	registerPlugin(plugin) {
		this._plugins.push(plugin);
		return this;
	}

	registerMiddleware(middleware, afterRoutes = false) {
		if (typeof middleware !== 'function') {
			throw new Error('The middleware must be function.');
		}
		this._middlewares.push({ callback: middleware, afterRoutes: afterRoutes || false });
		return this;
	}

	// #endregion

	/**
	 * Injects the code to the generated entry file.
	 *
	 * @param {string} code
	 */
	injectToEntry(code) {
		if (code) {
			this._entryInjections.push(code);
		}
		return this;
	}

	createRSFile(filename, content) {
		this._rsFiles.push({ filename, content });
		return this;
	}

	logInfo(tag, message, ...args) {
		this._log(`[${tag}]`, message, ...args);
	}

	logWarning(tag, message, ...args) {
		this._warn(`[${tag}]`, message, ...args);
	}

	logError(tag, message, ...args) {
		this._error(`[${tag}]`, message, ...args);
	}

	async bundle() {
		const { dev } = this._config;
		if (dev) {
			this._warn('Bundling in DEV mode is not permitted. Switching to production.');
			this._config.dev = false;
		}
		await this._prepare();
		this._webpack = WebpackConfig(this);
		this._setMiddlewares(true);
		return new Promise((resolve, reject) => {
			this._bundle(false, (err) => {
				if (err) {
					reject(err);
					return;
				}
				resolve();
			});
		});
	}

	/**
	 * Starts the express server. In that process it creates all necessary files.
	 *
	 * @param {function=} cb Callback to call after the server start.
	 */
	async start(skipBundle, cb = () => {}) {
		const { dev } = this._config;
		if (typeof skipBundle === 'function') {
			cb = skipBundle;
			skipBundle = false;
		}
		try {
			this._log(`App starting DEV: ${dev}`);
			await this._prepare();
			this._webpack = WebpackConfig(this);
			this._setMiddlewares(true);
			if (!skipBundle) {
				await this._bundleAndStart();
			} else {
				this._bundling = false;
				await this._startServer();
			}
		} catch (e) {
			process.nextTick(() => cb(e));
			return;
		}
		cb();
	}

	/**
	 * Stops the application.
	 * @param {function} cb
	 */
	stop(cb = () => {}) {
		if (!this._server) {
			this._warn('Server cannot be stopped because it was not started.');
			return;
		}
		this._server.close((err) => {
			this._log('The server is stopped.');
			if (typeof cb === 'function') {
				cb(err);
				return;
			}
			cb();
		});
	}

	// #region Private methods

	_createConfig(config) {
		this._config = _.merge(this._config, this._getConfigFromRSConfig(), config);
	}

	async _prepare() {
		const { appDir, staticDir, cssDir } = this._config;
		this._log('Validating directories');
		await this._validateDir(appDir, "App directory doesn't exist. Creating.", 'warn');
		await this._validateDir(this._getRSDirPath(), 'Creating RS directory.');
		await this._validateDir(path.resolve(`${staticDir}/${cssDir}`), 'Creating CSS directory.');
		await this._registerPlugins();
		this._setMiddlewares();
		this._registerRsConfig();
		await this._createRSFiles();
		this._webpack = WebpackConfig(this);
		this._setMiddlewares(true);
	}

	/**
	 * Registers the plugins calling `Plugin.register` on all registered plugins.
	 */
	async _registerPlugins() {
		// Register plugins from RS config
		if (this._rsConfig) {
			const { plugins } = this._config;
			if (plugins) {
				plugins.forEach((plugin) => {
					let name = plugin;
					let options;
					if (plugin instanceof Array) {
						if (!plugin.length) {
							this._error('Plugin specified as array must contain at least first element.');
							return;
						}
						[name, options] = plugin;
					}
					if (typeof name !== 'string') {
						this._error('Plugin module must be a string.', name);
						return;
					}
					const PluginModule = this._tryRequireModule(name, false) || this._tryRequireModule(name, true);
					if (!PluginModule) {
						this._error(`Couldn't import plugin module ${name}.`);
						return;
					}
					this.registerPlugin(new PluginModule(options));
				});
			}
		}
		// Register the plugin
		for (let i = 0; i < this._plugins.length; i++) {
			const plugin = this._plugins[i];
			try {
				await plugin.register(this);
				this._log(`Plugin ${plugin.getName()} registered.`);
			} catch (e) {
				this._error(`Plugin ${plugin.getName ? plugin.getName() : 'Unnamed plugin'} register failed.`, e);
			}
		}
	}

	/**
	 * Registers the RS config.
	 */
	_registerRsConfig() {
		if (this._rsConfig) {
			const { routes, components, socketClassDir, errorPage, componentProvider, error, componentErrorHandler } =
				this._rsConfig;
			if (routes) {
				Utils.registerRoutes(
					this,
					routes.map((route) => {
						const key = `${(route.route || 'GET').toLowerCase()} ${route.route}`;
						const callback = this._tryRequireModule(route.callback) || this._routeCallbacks[key]?.callback;
						return {
							...route,
							callback,
						};
					}),
				);
			}
			if (components) {
				Utils.registerComponents(this, components);
			}
			if (socketClassDir) {
				Utils.registerSocketClassDir(this, path.resolve(process.cwd(), socketClassDir));
			}
			if (errorPage) {
				this.registerErrorPage(errorPage);
			}
			if (error && error.page) {
				this.registerErrorPage(error.page);
			}
			if (componentProvider) {
				this.registerComponentProvider(componentProvider);
			}
			if (componentErrorHandler) {
				this.registerComponentErrorHandler(componentErrorHandler);
			}
		}
	}

	// #region RS files creators

	/**
	 * Creates the reacting-squirrel files.
	 */
	async _createRSFiles() {
		this._log('Creating RS files');
		await this._createResDir();
		await this._createNonceFile();
		await this._createEntryFile();
		await this._setRoutes();
		await this._createComponentsFile();
		await this._createSocketMap();
		await this._createPostCSSConfig();
		await this._createTSConfig();
		for (let i = 0; i < this._rsFiles.length; i++) {
			const { filename, content } = this._rsFiles[i];
			await fsAsync.writeFile(
				path.resolve(this._getRSDirPathAbsolute(), filename),
				typeof content === 'function' ? await content() : content,
			);
		}
	}

	/**
	 * Registers the routes to the express app and creates the routing map for the front-end.
	 */
	async _setRoutes() {
		this._log('Setting routes');
		const { appDir, createMissingComponents } = this._config;
		this._registerServiceRoutes();
		const componentsMap = {};
		this._routes.forEach((route) => {
			if (!route.contentComponent) {
				if (typeof route.callback === 'function') {
					this._setRoute(route);
					return;
				}
				const callback = this._routeCallbacks[`${route.method} ${route.spec}`]?.callback;
				if (typeof callback === 'function') {
					this._setRoute({ ...route, callback });
					return;
				}
				this._warn(`Content component for ${route.spec} no set.`);
				return;
			}
			const key = `__${md5(`${route.type}${route.spec}`)}__`;
			const modulePath = !path.isAbsolute(route.contentComponent)
				? path.resolve(`${appDir}/${route.contentComponent}`)
				: route.contentComponent;
			componentsMap[key] = {
				title: route.title,
				spec: route.spec,
				path: modulePath,
				layout: route.layout || null,
			};
			// If the page component doesn't exist and the server shouldn't generate page components don't register the route.
			if (!this._componentExists(modulePath) && !createMissingComponents) {
				this._warn(`Content component for ${route.spec} doesn't exist.`);
				return;
			}
			this._setRoute(route);
		});
		await this._createRoutingFile(componentsMap);
	}

	_registerServiceRoutes() {
		this._app.get(BUNDLE_STATUS_ROUTE, (req, res) => {
			res.end(this._bundlingStatus.toString());
		});
		this._app.get('/ping', (req, res) => {
			res.status(200).end('pong');
		});
	}

	/**
	 * Creates resources directory if doesn't exists.
	 * If the res directory doesn't contain text.json the file is created as well.
	 */
	async _createResDir() {
		const { appDir } = this._config;
		await this._validateDir(`${appDir}/res`, 'Creating RES directory.');
		await this._createTextFiles();
	}

	/**
	 * Creates all text files in the resources directory if don't exist.
	 */
	async _createTextFiles() {
		const { appDir, locale } = this._config;
		if (!locale.accepted || !locale.accepted.length) {
			return;
		}
		for (let i = 0; i < locale.accepted?.length; i++) {
			const acceptedLocale = locale.accepted[i];
			const fileName = this.getLocaleFileName(acceptedLocale);
			const filePath = `${appDir}/res/${fileName}`;
			try {
				await fsAsync.access(filePath);
			} catch (e) {
				this._log(`Creating text file ${fileName}`);
				await fsAsync.writeFile(filePath, '{}');
			}
		}
	}

	async _createNonceFile() {
		this._log('Creating nonce file');
		await fsAsync.writeFile(`${this._getRSDirPath()}/nonce.js`, `__webpack_nonce__ = '${this._nonce}'`);
	}

	/**
	 * Creates the entry file required for the webpack.
	 */
	async _createEntryFile() {
		this._log('Creating entry file');
		const { entryFile, appDir, connectSocketAutomatically, locale } = this._config;
		const pathToTheModule = this._getPathToModule(path.resolve(this._getRSDirPath()));
		let entryFileImport = null;
		if (entryFile) {
			const pathToTheEntryFile = path
				.relative(path.resolve(this._getRSDirPath()), path.resolve(appDir, entryFile))
				.replace(/\\/g, '/');
			entryFileImport = `import '${pathToTheEntryFile.replace(/\.js/, '')}';`;
		}
		const errorPageImport = this._errorPage
			? `import ErrorPage from '${path
					.relative(path.resolve(this._getRSDirPath()), path.resolve(appDir, this._errorPage))
					.replace(/\\/g, '/')}';`
			: `import { ErrorPage } from '${pathToTheModule}'`;
		let componentProviderImport = '';
		if (this._componentProvider) {
			if (!this._componentExists(this._componentProvider, true)) {
				this._warn(`Provider ${this._componentProvider} doesn't exist.`);
			} else {
				const p = path
					.relative(path.resolve(this._getRSDirPath()), this._componentProvider)
					.replace(/\\/g, '/');
				componentProviderImport = `import ComponentProvider from '${p}'`;
			}
		}
		let errorHandlerImport = '';
		if (this._componentErrorHandler) {
			if (!this._componentExists(this._componentErrorHandler, true)) {
				this._warn(`Provider ${this._componentErrorHandler} doesn't exist.`);
			} else {
				const p = path
					.relative(path.resolve(this._getRSDirPath()), this._componentErrorHandler)
					.replace(/\\/g, '/');
				errorHandlerImport = `import ErrorHandler from '${p}'`;
			}
		}
		await fsAsync.writeFile(
			`${this._getRSDirPath()}/entry.js`,
			`import './nonce';
import Application, { Socket, Text } from '${pathToTheModule}';
${errorPageImport}
${entryFileImport || ''}
import routingMap from './router.map';
import socketEvents from './socket.map';
import components from './component.map';
${componentProviderImport}
${errorHandlerImport}

// Import and register default dictionary.
import defaultDictionary from '../res/text.json';
Text.addDictionary(defaultDictionary);
// Import and register accepted locale dictionaries.
${locale.accepted
	.filter((l) => !this.isLocaleDefault(l))
	.map((l) => `Text.addDictionary('${l}', require('../res/${this.getLocaleFileName(l)}'));`)
	.join('\n')}
// Set the dictionary from locale
let dictionary = 'default';
if (Application.getCookie(Application.LOCALE_COOKIE_NAME)) {
	dictionary = Application.getCookie(Application.LOCALE_COOKIE_NAME);
} else if (navigator && navigator.language) {
	dictionary = navigator.language;
}
Application.setLocale(dictionary);
${componentProviderImport ? 'Application.registerComponentProvider(ComponentProvider);' : ''}
${errorHandlerImport ? 'Application.registerErrorhandler(ErrorHandler);' : ''}

// Register data to application and start it.
Application
	.registerRoutingMap(routingMap)
	.registerComponents(components)
	.registerErrorPage(ErrorPage)
	.registerLocales('${locale.default}', [${locale.accepted.map((l) => `'${l}'`).join(', ')}])
	.start();
Socket.registerEvents(socketEvents);
${connectSocketAutomatically ? 'Socket.connect();' : ''}
// Injected code
${this._entryInjections.join('\n')}
`,
		);
	}

	/**
	 * @typedef RouteMappings
	 * @property {string} title Title of the page.
	 * @property {string} spec Route spec of the page.
	 * @property {string} path Absolute path to the component.
	 */
	/**
	 * Creates the routing file for the front-end application.
	 *
	 * @param {Object.<string, RouteMappings>} map Map of the routes.
	 */
	async _createRoutingFile(map) {
		const { createMissingComponents, generatedComponentsExtension } = this._config;
		this._log('Creating routing file');
		const a = [];
		const b = [];
		const keys = Object.keys(map);
		for (let i = 0; i < keys.length; i++) {
			const key = keys[i];
			const route = map[key];
			if (!this._componentExists(route.path)) {
				this._warn(`Page ${route.path} doesn't exist.`, createMissingComponents ? 'GENERATING' : 'SKIPPING');
				if (!createMissingComponents) {
					continue;
				}
				const dirName = path.dirname(route.path);
				await mkdirp(dirName);
				const fileName = path.basename(route.path);
				const filePath = `${route.path}.${generatedComponentsExtension}`;
				await fsAsync.writeFile(
					filePath,
					`import { Page } from '${this._getPathToModule(dirName)}';

export default class ${this._createClassName(fileName, 'Page')} extends Page {}
`,
				);
			}
			const p = path.relative(path.resolve(this._getRSDirPath()), route.path).replace(/\\/g, '/');
			a.push(`import ${key} from '${p}';`);
			// eslint-disable-next-line max-len
			b.push(
				`{spec: '${route.spec}', component: ${key}, title: '${route.title}', layout: ${
					route.layout ? `'${md5(route.layout)}'` : null
				}}`,
			);
		}
		await fsAsync.writeFile(
			`${this._getRSDirPath()}/router.map.js`,
			`${a.join('\n')}${'\n'}export default [${b.join(',')}];`,
		);
	}

	/**
	 * Creates the file with custom components.
	 */
	async _createComponentsFile() {
		const { createMissingComponents, generatedComponentsExtension } = this._config;
		this._log('Creating components file');
		const a = [];
		const b = [];
		for (let i = 0; i < this._components.length; i++) {
			const component = this._components[i];
			if (!this._componentExists(component.path)) {
				this._warn(
					`Component ${component.path} doesn't exist.`,
					createMissingComponents ? 'GENERATING' : 'SKIPPING',
				);
				if (!createMissingComponents) {
					continue;
				}
				const dirName = path.dirname(component.path);
				await mkdirp(dirName);
				const fileName = path.basename(component.path);
				const filePath = `${component.path}.${generatedComponentsExtension}`;
				await fsAsync.writeFile(
					filePath,
					`import { Component } from '${this._getPathToModule(dirName)}';

export default class ${this._createClassName(fileName, 'Component')} extends Component {}
`,
				);
			}
			const key = `__${md5(`${component.path}${component.elementId}}`)}__`;
			const p = path.relative(path.resolve(this._getRSDirPath()), component.path).replace(/\\/g, '/');
			a.push(`import ${key} from '${p}'`);
			b.push(`{elementId: '${component.elementId}', component: ${key}}`);
		}
		await fsAsync.writeFile(
			`${this._getRSDirPath()}/component.map.js`,
			`${a.join('\n')}${'\n'}export default [${b.join(',')}];`,
		);
	}

	/**
	 * Creates the socket map for the front-end application.
	 */
	async _createSocketMap() {
		this._log('Creating socket map');
		await fsAsync.writeFile(
			`${this._getRSDirPath()}/socket.map.js`,
			`export default [${this._socketEvents.map((e) => `'${e.event}'`).join(',')}];`,
		);
	}

	/**
	 * Creates the postcss config for the front-end application.
	 */
	async _createPostCSSConfig() {
		this._log('Creating postcss config');
		await fsAsync.writeFile(
			`${this._getRSDirPath()}/postcss.config.js`,
			`module.exports={plugins:[['autoprefixer',${JSON.stringify(this._config.autoprefixer)}]]};`,
		);
	}

	/**
	 * Creates tsconfig.json in the RS directory.
	 */
	async _createTSConfig(tsConfig = {}) {
		this._log('Creating TS config');
		const { tsCompilerOptions } = this._config;
		await fsAsync.writeFile(
			`${this._getRSDirPath()}/tsconfig.json`,
			JSON.stringify(
				{
					...TSConfig,
					compilerOptions: _.merge(TSConfig.compilerOptions, tsCompilerOptions),
				},
				null,
				4,
			),
		);
	}

	// #endregion

	/**
	 * Registers the route to express.
	 *
	 * @param {*} route
	 */
	_setRoute(route) {
		const { dev, layoutComponent, getInitialData, getTitle, envVars } = this._config;
		this._app[route.method](route.spec, async (req, res, next) => {
			if (route.requireAuth && req.session.getUser() === null) {
				next(HttpError.create(401));
				return;
			}
			try {
				await this._beforeCallback(req, res);
			} catch (e) {
				next(e);
				return;
			}
			let layout = layoutComponent;
			if (route.layout) {
				if (typeof route.layout === 'string') {
					layout = require(path.resolve(route.layout));
					if (layout.default) {
						layout = layout.default;
					}
				} else {
					// eslint-disable-next-line prefer-destructuring
					layout = route.layout;
				}
			}
			let { title } = route;
			let additionalData = {};
			try {
				title = (await getTitle(req)) || title;
				additionalData = (await getInitialData(req)) || {};
			} catch (e) {
				next(e);
				return;
			}
			const data = {
				title,
				data: {
					user: req.session.getUser(),
					dev,
					timestamp: Date.now(),
					version: this._version,
					locale: req.locale,
					...additionalData,
					envVars: envVars || {},
				},
				layout,
			};
			if (typeof route.callback !== 'function') {
				res.renderLayout(data);
				return;
			}
			let dataSent = false;
			const p = route.callback(req, res, (err, d = {}) => {
				this._warn('Using callback functions in the route execution is deprecated. Use Promises.');
				if (dataSent) {
					return;
				}
				dataSent = true;
				if (err) {
					next(err);
					return;
				}
				if (res.headerSent) {
					return;
				}
				res.renderLayout(_.merge(data, d));
			});
			if (p instanceof Promise) {
				try {
					const d = await p;
					if (dataSent) {
						return;
					}
					dataSent = true;
					if (res.headersSent) {
						return;
					}
					res.renderLayout(_.merge(data, d));
				} catch (error) {
					next(error);
				}
			}
		});
	}

	/**
	 * Checks if the directory exists. If doesn't the directory is created.
	 *
	 * @param {string} dir Directory to check.
	 * @param {string} message Message shown if the directory is creating.
	 * @param {'log'|'warn'} level Log level of the message.
	 * @returns {Promise<void>}
	 */
	async _validateDir(dir, message = null, level = 'log') {
		if (fs.existsSync(dir)) {
			return;
		}
		const msg = message || `Directory ${dir} doesn't exist. Creating.`;
		switch (level) {
			case 'warn':
				this._warn(msg);
				break;
			default:
				this._log(msg);
		}
		await mkdirp(dir);
	}

	/**
	 * Starts the webpack and the express server. If the app is in dev mode the webpack watcher is started.
	 */
	async _bundleAndStart() {
		const { bundleAfterServerStart } = this._config;
		if (!bundleAfterServerStart) {
			await this._bundle();
			await this._startServer();
			return;
		}
		await this._startServer();
		await this._bundle();
	}

	async _bundle() {
		const { dev } = this._config;
		this._bundling = true;
		if (dev) {
			await this._compileStylesAsync();
			this._log('Starting webpack');
			await this._startWatcher();
		} else {
			this._log('Starting webpack');
			await this._startWebpack();
			await this._compileStylesAsync();
		}
		this._bundling = false;
	}

	_startServer() {
		const { port } = this._config;
		return new Promise((resolve, reject) => {
			this._server.listen(port, () => {
				this._log(`App listening on ${port}`);
				resolve();
			});
		});
	}

	_startWebpack() {
		return new Promise((resolve, reject) => {
			this._webpack.run((err, stats) => {
				if (err) {
					reject(err);
					return;
				}
				const minimalStats = stats.toJson('minimal');
				this._log(minimalStats);
				const { errors } = minimalStats;
				if (errors && errors.length) {
					reject(
						new Error(`Webpack bundle cannot be created. ${errors.length} errors found.`, 'bundle', {
							errors,
						}),
					);
					return;
				}
				resolve();
			});
		});
	}

	_startWatcher() {
		return new Promise((resolve) => {
			let listening = false;
			// eslint-disable-next-line no-shadow
			this._webpack.watch({ aggregateTimeout: 500 }, async (err, stats) => {
				if (err) {
					this._error(err);
					return;
				}
				if (listening) {
					try {
						await this._compileStylesAsync();
					} catch (error) {
						this._error(error);
					}
				}
				this._log(stats.toJson('minimal'));
				Socket.broadcast('webpack.stats', stats.toJson('minimal'));
				if (!listening) {
					listening = true;
					resolve();
				}
			});
		});
	}

	/**
	 *
	 * @param {express.Request} req
	 * @param {express.Response} res
	 * @returns {Promise<void>}
	 */
	async _beforeCallback(req, res) {
		if (this._beforeExecution.length) {
			for (let i = 0; i < this._beforeExecution.length; i++) {
				const { spec, callback } = this._beforeExecution[i];
				if (spec === '*') {
					// eslint-disable-next-line no-await-in-loop
					await callback(req, res);
					// eslint-disable-next-line no-continue
					continue;
				}
				const r = new RouteParser(spec);
				const match = r.match(req.path);
				if (!match) {
					// eslint-disable-next-line no-continue
					continue;
				}
				// eslint-disable-next-line no-await-in-loop
				await callback(req, res);
			}
		}
	}

	/**
	 * Sets the express app and registers socket server.
	 */
	_setApp() {
		const { appDir, locale } = this._config;
		this._app = express();
		this._server = http.createServer(this._app);
		socket(this, {
			cookie: false,
			...this._config.socketIO,
		});
		// eslint-disable-next-line no-underscore-dangle
		this.Session._server = this;
		try {
			Text.addDictionary(require(path.resolve(appDir, 'res', 'text.json')));
			locale.accepted
				.filter((l) => l !== locale.default)
				.forEach((acceptedLocale) =>
					Text.addDictionary(
						acceptedLocale,
						require(path.resolve(appDir, 'res', this.getLocaleFileName(acceptedLocale))),
					),
				);
		} catch (e) {
			this._warn(e.message);
		}
	}

	/**
	 * Registers middlewares to the express instance.
	 *
	 * @param {boolean} afterRoutes If true the middlewares are registered after the routes registration.
	 */
	_setMiddlewares(afterRoutes = false) {
		const { staticDir, cookies } = this._config;
		const { secret } = cookies;
		if (!afterRoutes) {
			this._app.use(express.static(staticDir));
			this._app.use(cookieParser(secret));
			this._app.use(compression());
			this._app.use(CookiesMiddleware(this));
			this._app.use(SessionMiddleware(this));
			this._app.use(LocaleMiddleware(this));
			this._app.use(RenderMiddleware(this));
			this._app.use(AuthMiddleware(this));
			this._app.use(BundlingMiddleware(this));
			this._middlewares
				// eslint-disable-next-line no-shadow
				.filter(({ afterRoutes }) => !afterRoutes)
				.forEach(({ callback }) => this._app.use(callback(this)));
			return;
		}
		this._middlewares
			// eslint-disable-next-line no-shadow
			.filter(({ afterRoutes }) => afterRoutes)
			.forEach(({ callback }) => this._app.use(callback(this)));
		this._app.use('*', PageNotFoundMiddleware());
		this._app.use(ErrorMiddleware(this));
	}

	async _compileStylesAsync() {
		this._log('Compiling styles');
		const { cssDir, staticDir, mergeStyles, sourceStylesDir } = this._config;
		const dir = path.resolve(`${staticDir}/${cssDir}`);
		const stylesPath = `${dir}/rs-app.css`;
		try {
			await fsAsync.access(stylesPath);
			await fsAsync.unlink(stylesPath);
		} catch (e) {
			// ignore
		}
		const compiler = new StylesCompiler(
			[path.resolve(__dirname, './assets/loader.scss'), ...mergeStyles, sourceStylesDir, dir],
			dir,
			'rs-app.css',
		);
		await compiler.compile();
		const files = await fsAsync.readdir(dir);
		// eslint-disable-next-line no-restricted-syntax
		for (const file of files) {
			try {
				if (file.indexOf('rs-tmp') >= 0) {
					await fsAsync.unlink(`${dir}/${file}`);
				}
				if (file.indexOf('cs-tmp') >= 0) {
					await fsAsync.unlink(`${dir}/${file}`);
				}
			} catch (e) {
				this._error(e);
			}
		}
		const css = await fsAsync.readFile(stylesPath);
		const result = await postcss([autoprefixer(this._config.autoprefixer)]).process(css, { from: stylesPath });
		await fsAsync.writeFile(stylesPath, result.css);
	}

	// #region FS helpers

	/**
	 * Gets the relative path to the RS directory.
	 *
	 * @returns {string}
	 */
	_getRSDirPath() {
		const { appDir } = this._config;
		return `${appDir}/${RS_DIR}`;
	}

	/**
	 * Gets the absolute path to the RS directory.
	 *
	 * @returns {string}
	 */
	_getRSDirPathAbsolute() {
		return path.resolve(this._getRSDirPath());
	}

	/**
	 * Checks if component exists. If the path doesn't contain extension js(x) and ts(x) extensions are tried.
	 *
	 * @param {string} filePath Absolute path to the component.
	 * @param {boolean} tryIndexFile Indicates if the component should be checked within the index file in directory.
	 */
	_componentExists(filePath, tryIndexFile = true) {
		if (path.extname(filePath)) {
			return fs.existsSync(filePath);
		}
		let exists = false;
		['js', 'jsx', 'ts', 'tsx'].forEach((ext) => {
			if (exists) {
				return;
			}
			exists = fs.existsSync(`${filePath}.${ext}`);
		});
		if (!exists && tryIndexFile) {
			return this._componentExists(path.resolve(filePath, 'index'), false);
		}
		return exists;
	}

	/**
	 * Gets the path to the module depending on the module development status.
	 */
	_getPathToModule(sourceDir) {
		const { moduleDev } = this._config;
		return moduleDev
			? path.relative(sourceDir, path.resolve('./src/app')).replace(/\\/g, '/')
			: 'reacting-squirrel';
	}

	// #endregion

	// #region Class loaders helpers

	/**
	 * Creates class name from the string.
	 *
	 * @param {string} s
	 * @param {string} suffix
	 */
	_createClassName(s, suffix = '') {
		return this._capitalizeFirstLetter(s).replace(/\./g, '_').replace(/-/g, '_') + suffix;
	}

	/**
	 * Capitalizes first letter.
	 *
	 * @param {string} s String to capitalize.
	 */
	_capitalizeFirstLetter(s) {
		if (s.length < 1) {
			return null;
		}
		return s.charAt(0).toUpperCase() + s.slice(1);
	}

	// #endregion

	/**
	 * Gets the config from rsconfig file.
	 */
	_getConfigFromRSConfig() {
		if (!this._rsConfig) {
			return {};
		}
		const { routes, components, socketClassDir, errorPage, ...config } = this._transformEnvVars(this._rsConfig);
		const {
			layoutComponent,
			session,
			auth,
			errorHandler,
			error,
			onWebpackProgress,
			webpack,
			mergeStyles,
			...restConfig
		} = config;
		return {
			...restConfig,
			layoutComponent: layoutComponent ? this._tryRequireModule(layoutComponent) : undefined,
			session: session ? this._tryRequireModule(session) : undefined,
			auth: auth ? this._tryRequireModule(auth) : undefined,
			errorHandler: errorHandler ? this._tryRequireModule(errorHandler) : undefined,
			error: error
				? {
						handler: error.handler ? this._tryRequireModule(error.handler) : undefined,
						// eslint-disable-next-line no-nested-ternary
						layout: error.layout
							? typeof error.layout === 'string'
								? this._tryRequireModule(error.layout)
								: error.layout
							: undefined,
				  }
				: undefined,
			onWebpackProgress: onWebpackProgress ? this._tryRequireModule(onWebpackProgress) : undefined,
			// eslint-disable-next-line no-nested-ternary
			webpack: webpack ? (typeof webpack === 'string' ? this._tryRequireModule(webpack) : webpack) : undefined,
			mergeStyles:
				mergeStyles && mergeStyles.length ? mergeStyles.map((style) => path.resolve(style)) : undefined,
		};
	}

	_transformEnvVars(config) {
		if (!config) {
			return config;
		}
		if (typeof config === 'number') {
			return config;
		}
		if (typeof config === 'boolean') {
			return config;
		}
		if (typeof config === 'string') {
			return this._getEnvVar(config);
		}
		if (config instanceof Array) {
			return config.map((item) => this._transformEnvVars(item));
		}
		const o = {};
		Object.keys(config).forEach((key) => {
			o[key] = this._transformEnvVars(config[key]);
		});
		return o;
	}

	_getEnvVar(value) {
		if (value && value.indexOf(CONFIG_ENV_PREFIX) === 0) {
			const [envVar, defaultValue] = value.replace(CONFIG_ENV_PREFIX, '').split('|');
			if (envVar) {
				if (process.env[envVar] === undefined) {
					this._warn(`The env var '${envVar}' from config is undefined.`);
					if (defaultValue) {
						return defaultValue;
					}
				}
				return process.env[envVar];
			}
		}
		return value;
	}

	_getLocaleText(locale, key, ...args) {
		if (this.isLocaleDefault(locale)) {
			return Text.getFromDictionary('default', key, ...args);
		}
		return Text.getDictionary(locale)
			? Text.getFromDictionary(locale, key, ...args)
			: Text.getFromDictionary('default', key, ...args);
	}

	/**
	 * Tries to require file.
	 *
	 * @param {string} filePath Path to the file to require.
	 * @param {boolean} resolve Indicates if `path.resolve` should be used on the filePath.
	 */
	_tryRequireModule(filePath, resolve = true) {
		if (!filePath) {
			return null;
		}
		try {
			const m = require(path.normalize(resolve ? path.resolve(filePath) : filePath));
			return m.default || m;
		} catch (e) {
			this._warn(e);
			return null;
		}
	}

	// #region Loggers

	/**
	 * Logs the message to the console if the app is in the dev mode.
	 *
	 * @param {string} message Message to log.
	 */
	_log(message, ...args) {
		const { dev, logging } = this._config;
		if (!dev || !logging) {
			return;
		}
		// eslint-disable-next-line no-console
		console.log(new Date(), '[INFO]', message, ...args);
	}

	/**
	 * Logs the warning message to the console.
	 *
	 * @param {string} message Message to log.
	 */
	_warn(message, ...args) {
		const { logging } = this._config;
		if (!logging) {
			return;
		}
		// eslint-disable-next-line no-console
		console.warn(new Date(), '[WARN]', message, ...args);
	}

	_error(message, ...args) {
		const { logging } = this._config;
		if (!logging) {
			return;
		}
		// eslint-disable-next-line no-console
		console.error(new Date(), '[ERROR]', message, ...args);
	}

	// #endregion

	// #endregion
}

export {
	// eslint-disable-next-line no-restricted-exports
	Server as default,
	HttpError,
	Layout,
	Plugin,
	Session,
	Socket,
	SocketClass,
	Utils,
};
