/* eslint-disable max-classes-per-file */
import '@babel/polyfill';
import CliProgress from 'cli-progress';
import fs from 'fs';
import path from 'path';
import React from 'react';

import Server, { Layout, Plugin, Socket } from '../../../server';

class CustomLayout extends Layout {
	renderContainer() {
		return (
			<div id="container">
				<div id="test" />
				<div id="socket-status" />
				<div id="content">{this.renderLoader()}</div>
			</div>
		);
	}
}

const dev = true;

let bar;

const app = new Server({
	appDir: './__tests__app__/app',
	staticDir: './__tests__app__/public',
	moduleDev: true,
	dev,
	layoutComponent: CustomLayout,
	entryFile: 'entry.js',
	styles: ['/css/main.css'],
	scripts: ['/js/script.js?api_key=API_KEY'],
	/* mergeStyles: [
		path.resolve('./node_modules/bootstrap/dist/css/bootstrap.css'),
	], */
	rsConfig: path.resolve(__dirname, '../rsconfig.json'),
	// createMissingComponents: true,
	// autoprefixer: { grid: 'autoplace' },
	// cookieSecret: 'dev-secret',
	// socketMessageMaxSize: 1,
	// babelTranspileModules: ['react'],
	// connectSocketAutomatically: false,
	locale: {
		default: 'en-US',
		accepted: ['cs-CZ'],
	},
	bundleAfterServerStart: true,
	onWebpackProgress: dev
		? undefined
		: (p) => {
				if (!bar) {
					bar = new CliProgress.SingleBar({ clearOnComplete: true }, CliProgress.Presets.shades_classic);
					bar.start(100);
				}
				bar.update(Math.round(p * 100));
				if (p === 1) {
					bar.stop();
				}
		  },
	getInitialData: () => ({ test: 'test' }),
});

app.registerBeforeExecution('*', async (req, res) => {
	// res.header('Content-Security-Policy', `style-src 'self' 'nonce-${app.nonce}'`);
});

app.registerRoute('get', '/error', null, 'Error', false, (req, res, next) => {
	next({ message: 'Test error', date: new Date(), statusCode: 501 });
});

app.registerRoute('get', '/error/401', null, 'Error', false, (req, res, next) => {
	next({ message: 'Unauthorized', date: new Date(), statusCode: 401 });
});

app.registerRoute(
	'get',
	'/absolute-test',
	path.resolve(__dirname, '../../app/absolute-test/page'),
	'Absolute page test',
)
	.registerComponent(path.resolve(__dirname, '../../app/absolute-test/component'), 'absolute-component')
	.registerRouteCallback('/no-component', (req, res) => res.end('OVERRIDE SEND'));

/*
app.registerRouteCallback('/', (req, res, next) => {
	next(null, { title: 'Dynamic title', data: { test: 'test' } });
});
*/
app.registerSocketEvent('socket.test', async (socket, data) => data);
app.registerSocketEvent('socket.file', async (socket, { file, name }) => {
	fs.writeFileSync(`./tmp/${name}`, file);
});

app.createRSFile('custom-file.ts', "console.log('custom-file', new Date());")
	.injectToEntry("import './custom-file';")
	// eslint-disable-next-line arrow-body-style
	.createRSFile('custom-file.fn.ts', async () => {
		return "console.log('custom-file.fn', new Date());";
	})
	.injectToEntry("import './custom-file.fn';");

class CustomPlugin extends Plugin {
	getName() {
		return 'custom-plugin';
	}

	getVersion() {
		return '1.0.1';
	}

	getEntryInjections() {
		return ["console.log('custom plugin');"];
	}

	getStyles() {
		return ['/css/plugin.css'];
	}

	getMiddlewares() {
		return [
			{
				callback: (server) => (req, res, next) => {
					// res.render = () => res.end('OVERRIDDEN RENDER');
					next();
				},
			},
		];
	}
}

app.registerPlugin(new CustomPlugin());

// console.log(app.Text.get('test'));

// app.Text.addDictionary('cs-CZ', require(path.resolve(app.appDirAbsolute, 'res', 'text_cs-CZ.json')));

(async () => {
	/*
	try {
		await app.bundle();
	} catch (e) {
		console.error(e);
		return;
	}
	*/
	app.start((err) => {
		if (err) {
			console.error(err);
			return;
		}
		console.log('App started');
	});

	Socket.on('connection', (socket) => console.log('SOCKET CONNECTED'));
})();
