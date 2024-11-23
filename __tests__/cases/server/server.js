import { expect } from 'chai';
import cookieSignature from 'cookie-signature';
import fs from 'fs';
import path from 'path';
import request from 'request';

import Server from '../../../src/server';
import Layout from '../../../src/server/layout';
import Session from '../../../src/server/session';

const PROJECT_PATH = path.resolve(__dirname, '../../../');
const TEST_SESSION_ID = 'test-session-id';

const CONFIG_FIELDS = [
	'port',
	'staticDir',
	'dev',
	'jsDir',
	'filename',
	'appDir',
	'entryFile',
	'layoutComponent',
	'cookieSecret',
	'scripts',
	'styles',
	'session',
	'auth',
	'error',
	// 'errorHandler',
	'webpack',
	'moduleDev',
	'bundlePathRelative',
	'cssDir',
	'mergeStyles',
	'onWebpackProgress',
	'rsConfig',
	'socketIO',
	'socketMessageMaxSize',
	'autoprefixer',
	'babelTranspileModules',
	'cookies',
	'createMissingComponents',
	'generatedComponentsExtension',
	'sourceStylesDir',
	'connectSocketAutomatically',
	'locale',
	'logging',
	'bundleAfterServerStart',
	'getInitialData',
	'getTitle',
	'tsCompilerOptions',
	'envVars',
];

describe('Server instance', () => {
	it('checks default config fields of the server', () => {
		const server = new Server({ logging: false });
		expect(server.getConfig()).to.have.all.keys(CONFIG_FIELDS);
		const {
			port,
			staticDir,
			dev,
			jsDir,
			filename,
			appDir,
			entryFile,
			layoutComponent,
			scripts,
			styles,
			session,
			auth,
			error,
			webpack,
			locale,
			bundleAfterServerStart,
			tsCompilerOptions,
			envVars,
		} = server.getConfig();
		expect(port).to.be.equal(8080);
		expect(staticDir).to.be.equal('./public');
		expect(dev).to.be.equal(false);
		expect(jsDir).to.be.equal('js');
		expect(filename).to.be.equal('bundle.js');
		expect(appDir).to.be.equal('./app');
		expect(entryFile).to.be.equal(null);
		expect(layoutComponent).to.be.an('function');
		expect(new layoutComponent()).to.be.an.instanceOf(Layout);
		// expect(cookieSecret).to.be.an('string');
		expect(scripts).to.be.an.instanceOf(Array);
		expect(scripts.length).to.be.equal(0);
		expect(styles).to.be.an.instanceOf(Array);
		expect(styles.length).to.be.equal(0);
		expect(session).to.be.an('function');
		expect(new session()).to.be.an.instanceOf(Session);
		expect(auth).to.be.an('function');
		// expect(error).to.have.all.keys(['handler']);
		expect(webpack).to.be.an('object');
		expect(locale).to.have.all.keys(['default', 'accepted']);
		expect(locale.default).to.be.equal('en-US');
		expect(locale.accepted).to.be.deep.equal(['en-US']);
		expect(bundleAfterServerStart).to.be.false;
		expect(tsCompilerOptions).to.deep.equal({});
		expect(envVars).to.deep.equal({});

		expect(server.port).to.be.equal(port);
		expect(server.staticDir).to.be.equal(staticDir);
		expect(server.staticDirAbsolute).to.be.equal(path.resolve(PROJECT_PATH, staticDir));
		expect(server.dev).to.be.equal(dev);
		expect(server.bundlePath).to.be.equal(`/${jsDir}/${filename}`);
		expect(server.bundlePathAbsolute).to.be.equal(path.resolve(PROJECT_PATH, staticDir, jsDir, filename));
		expect(server.appDir).to.be.equal(appDir);
		expect(server.appDirAbsolute).to.be.equal(path.resolve(PROJECT_PATH, appDir));
		expect(server.path).to.be.equal(path.resolve(PROJECT_PATH, `${staticDir}/${jsDir}`));
		expect(new server.Layout()).to.be.an.instanceOf(Layout);
		expect(new server.Session()).to.be.an.instanceOf(Session);
		expect(new server.Session().getServer()).to.be.equal(null);
	});

	it('checks the set config fields of the server', () => {
		const server = new Server({
			port: 9000,
			staticDir: './__static__',
			dev: true,
			jsDir: '__js__',
			filename: '__bundle__.js',
			appDir: './__app__',
			entryFile: 'entry.js',
			layoutComponent: Layout,
			cookieSecret: 'cookie-secret',
			scripts: ['some-script.js'],
			styles: ['some-style.css'],
			session: Session,
			auth: (session, next) => next(),
			webpack: {},
			locale: {
				default: 'cs-CZ',
				accepted: ['en-US'],
			},
			logging: false,
			error: {
				layout: Layout,
			},
			bundleAfterServerStart: true,
			envVars: {
				key: 'value',
			},
			tsCompilerOptions: {
				target: 'es6',
			},
		});
		expect(server._config).to.have.all.keys(CONFIG_FIELDS);
		const {
			port,
			staticDir,
			dev,
			jsDir,
			filename,
			appDir,
			entryFile,
			layoutComponent,
			cookieSecret,
			scripts,
			styles,
			session,
			auth,
			error,
			webpack,
			locale,
			logging,
			bundleAfterServerStart,
			tsCompilerOptions,
			envVars,
		} = server._config;
		expect(port).to.be.equal(9000);
		expect(staticDir).to.be.equal('./__static__');
		expect(dev).to.be.equal(true);
		expect(jsDir).to.be.equal('__js__');
		expect(filename).to.be.equal('__bundle__.js');
		expect(appDir).to.be.equal('./__app__');
		expect(entryFile).to.be.equal('entry.js');
		expect(layoutComponent).to.be.an('function');
		expect(new layoutComponent()).to.be.an.instanceOf(Layout);
		expect(cookieSecret).to.be.an('string');
		expect(scripts).to.be.an.instanceOf(Array);
		expect(scripts.length).to.be.equal(1);
		expect(scripts[0]).to.be.equal('some-script.js');
		expect(styles).to.be.an.instanceOf(Array);
		expect(styles.length).to.be.equal(1);
		expect(styles[0]).to.be.equal('some-style.css');
		expect(session).to.be.an('function');
		expect(new session()).to.be.an.instanceOf(Session);
		expect(auth).to.be.an('function');
		expect(error).to.have.all.keys([/*'handler',*/ 'layout']);
		// expect(error.handler).to.be.a('function');
		expect(new error.layout()).to.be.an.instanceOf(Layout);
		expect(webpack).to.be.an('object');
		expect(locale).to.have.all.keys(['default', 'accepted']);
		expect(locale.default).to.be.equal('cs-CZ');
		expect(locale.accepted).to.be.deep.equal(['cs-CZ', 'en-US']);
		expect(logging).to.be.false;
		expect(bundleAfterServerStart).to.be.true;
		expect(tsCompilerOptions).to.deep.equal({ target: 'es6' });
		expect(envVars).to.deep.equal({ key: 'value' });

		expect(server.port).to.be.equal(port);
		expect(server.staticDir).to.be.equal(staticDir);
		expect(server.staticDirAbsolute).to.be.equal(path.resolve(PROJECT_PATH, staticDir));
		expect(server.dev).to.be.equal(dev);
		expect(server.bundlePath).to.be.equal(`/${jsDir}/${filename}`);
		expect(server.bundlePathAbsolute).to.be.equal(path.resolve(PROJECT_PATH, staticDir, jsDir, filename));
		expect(server.appDir).to.be.equal(appDir);
		expect(server.appDirAbsolute).to.be.equal(path.resolve(PROJECT_PATH, appDir));
		expect(server.path).to.be.equal(path.resolve(PROJECT_PATH, `${staticDir}/${jsDir}`));
		expect(new server.Layout()).to.be.an.instanceOf(Layout);
		expect(new server.Session()).to.be.an.instanceOf(Session);
		expect(new server.Session().getServer()).to.be.equal(null);
	});

	it('tries to set not Layout child as a layoutComponent', () => {
		expect(() => new Server({ layoutComponent: class {}, logging: false })).to.throw(
			Error,
			'Cannot create instance of Layout.',
		);
	});

	it('tries to set not Session child as a session', () => {
		expect(() => new Server({ session: class {}, logging: false })).to.throw(
			Error,
			'Cannot create instance of Session.',
		);
	});

	it('checks if the auth method is called', (done) => {
		const server = new Server({ auth: (session, next) => done(), logging: false });
		server.auth();
	});
});

describe('Start of the server', () => {
	const URL = 'http://localhost:8080';
	let server;

	it('starts the server', (done) => {
		server = new Server({
			appDir: './__tests__/app',
			staticDir: './__tests__/public',
			moduleDev: true,
			auth: (session, next) => {
				if (session.id === TEST_SESSION_ID) {
					session.setUser({ id: 1 });
				}
				next();
			},
			createMissingComponents: true,
			logging: false,
		});

		const RS_DIR = server._getRSDirPathAbsolute();

		server
			.registerRoute('get', '/', 'pages/home', 'Home')
			.registerRoute('get', '/user', 'pages/user', 'User', true)
			.registerRoute('get', '/callback')
			.registerRoute('post', '/callback')
			.registerRoute('get', '/callback/promise')
			.registerRoute('post', '/callback/promise')
			.registerComponent('components/test', 'test')
			.registerSocketEvent('test', async () => {
				return 'test';
			})
			.registerRouteCallback('/callback', (req, res) => {
				res.end('GET callback');
			})
			.registerRouteCallback('post', '/callback', (req, res) => {
				res.end('POST callback');
			})
			.registerRouteCallback('/callback/promise', async () => {
				return { title: 'Callback promise' };
			})
			.registerRouteCallback('post', '/callback/promise', async (req, res) => {
				res.end('Callback promise');
			})
			.start((err) => {
				expect(err).to.be.undefined;
				expect(fs.existsSync(server.staticDirAbsolute)).to.be.equal(true);
				expect(fs.existsSync(server.bundlePathAbsolute)).to.be.equal(true);
				expect(fs.existsSync(RS_DIR)).to.be.equal(true);
				expect(fs.existsSync(path.normalize(`${RS_DIR}/nonce.js`))).to.be.equal(true);
				expect(fs.existsSync(path.normalize(`${RS_DIR}/entry.js`))).to.be.equal(true);
				expect(fs.existsSync(path.normalize(`${RS_DIR}/router.map.js`))).to.be.equal(true);
				expect(fs.existsSync(path.normalize(`${RS_DIR}/component.map.js`))).to.be.equal(true);
				expect(fs.existsSync(path.normalize(`${RS_DIR}/socket.map.js`))).to.be.equal(true);
				expect(fs.existsSync(path.normalize(`${RS_DIR}/postcss.config.js`))).to.be.equal(true);
				expect(fs.existsSync(path.normalize(`${RS_DIR}/tsconfig.json`))).to.be.equal(true);
				expect(fs.existsSync(path.normalize(`${server.appDirAbsolute}/res`))).to.be.equal(true);
				expect(fs.existsSync(path.normalize(`${server.appDirAbsolute}/res/text.json`))).to.be.equal(true);
				expect(fs.existsSync(path.normalize(`${server.appDirAbsolute}/pages/home.tsx`))).to.be.equal(true);
				expect(fs.existsSync(path.normalize(`${server.appDirAbsolute}/pages/user.tsx`))).to.be.equal(true);
				expect(fs.existsSync(path.normalize(`${server.appDirAbsolute}/components/test.tsx`))).to.be.equal(true);
				expect(fs.existsSync(path.normalize(`${server.staticDirAbsolute}/js/bundle.js`))).to.be.equal(true);
				expect(fs.existsSync(path.normalize(`${server.staticDirAbsolute}/css/rs-app.css`))).to.be.equal(true);

				done();
			});
	}).timeout(30000);

	it('checks the /ping route', (done) => {
		request.get(`${URL}/ping`, (err, res, body) => {
			expect(err).to.be.equal(null);
			expect(res.statusCode).to.be.equal(200);
			expect(body).to.be.equal('pong');
			done();
		});
	});

	it('checks if the home page is accessible with http request', (done) => {
		request.get(URL, (err, res, body) => {
			expect(err).to.be.equal(null);
			expect(res.statusCode).to.be.equal(200);
			done();
		});
	});

	it('checks if the home page returns the layout', (done) => {
		request.get(URL, (err, res, body) => {
			expect(err).to.be.equal(null);
			expect(res.statusCode).to.be.equal(200);
			expect(body.includes('<title>Home</title>'));
			done();
		});
	});

	it('checks if the bundle.js is accessible with http request', (done) => {
		request.get(`${URL}${server.bundlePath}`, (err, res, body) => {
			expect(err).to.be.equal(null);
			expect(res.statusCode).to.be.equal(200);
			done();
		});
	});

	it('checks if the user page which requires authorization returns http 401 error', (done) => {
		request.get(`${URL}/user`, (err, res, body) => {
			expect(err).to.be.equal(null);
			expect(res.statusCode).to.be.equal(401);
			done();
		});
	});

	it('checks if the test page will return 404 error', (done) => {
		request.get(`${URL}/test`, (err, res, body) => {
			expect(err).to.be.equal(null);
			expect(res.statusCode).to.be.equal(404);
			done();
		});
	});

	it('checks if the user is logged on the test session id and the user page returns 200 http code', (done) => {
		request.get(
			{
				url: `${URL}/user`,
				headers: {
					cookie: `session_id=${cookieSignature.sign(TEST_SESSION_ID, server._config.cookies.secret)}`,
				},
			},
			(err, res, body) => {
				expect(err).to.be.equal(null);
				expect(res.statusCode).to.be.equal(200);
				done();
			},
		);
	});

	it('checks if GET callback is correctly registered', (done) => {
		request.get(
			{
				url: `${URL}/callback`,
			},
			(err, res, body) => {
				expect(err).to.be.equal(null);
				expect(res.statusCode).to.be.equal(200);
				expect(body).to.be.equal('GET callback');
				done();
			},
		);
	});

	it('checks if POST callback is correctly registered', (done) => {
		request.post(
			{
				url: `${URL}/callback`,
			},
			(err, res, body) => {
				expect(err).to.be.equal(null);
				expect(res.statusCode).to.be.equal(200);
				expect(body).to.be.equal('POST callback');
				done();
			},
		);
	});

	it('checks if GET callback with promise returns the layout', (done) => {
		request.get(
			{
				url: `${URL}/callback/promise`,
			},
			(err, res, body) => {
				expect(err).to.be.equal(null);
				expect(res.statusCode).to.be.equal(200);
				expect(body.includes('<title>Callback promise</title>'));
				done();
			},
		);
	});

	it('checks if POST callback with promise is correctly registered', (done) => {
		request.post(
			{
				url: `${URL}/callback/promise`,
			},
			(err, res, body) => {
				expect(err).to.be.equal(null);
				expect(res.statusCode).to.be.equal(200);
				expect(body).to.be.equal('Callback promise');
				done();
			},
		);
	});
});
