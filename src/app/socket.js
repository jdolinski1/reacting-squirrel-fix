/** @module Socket */
import io from 'socket.io-client';

import CallbackEmitter from './callback-emitter';

const __DEV__ = true; // TODO

/**
 * Class to handle communication with the server app using websockets.
 */
class Socket extends CallbackEmitter {

    /**
     * The socket is not initiated.
     */
    static STATE_NONE = 'none';
    /**
     * The socket is connecting to the server.
     */
    static STATE_CONNECTING = 'connecting';
    /**
     * The socket is connected to the server.
     */
    static STATE_CONNECTED = 'connected';
    /**
     * The socket is disconnected from the server.
     */
    static STATE_DISCONNECTED = 'disconnected';

    _socket = null;
    _state = Socket.STATE_NONE;
    /* _events = [
        'test',
        'login',
        'project',
        'projects',
        'projectStats',
        'projectState',
        'createProject',
        'team',
        'customer',
        'customers',
        'createCustomer',
        'company',
    ].concat(Map); */
    _events = [
        'handshake',
    ];

    registerEvents(events) {
        this._events = this._events.concat(events);
    }

    /**
     * Connects the socket to the server. This method can be called only once. If the server disconnects the socket the socket is automatically reconnected when it's posiible.
     */
    connect() {
        if (this._state !== Socket.STATE_NONE) {
            throw new Error('Socket already connected');
        }
        this._setState(Socket.STATE_CONNECTING);
        // TODO mrknout na origin control
        this._socket = io();
        this._socket.on('connect', () => {
            console.log('Socket connected');
            this._setState(Socket.STATE_CONNECTED);
        });
        this._socket.on('disconnect', () => {
            console.log('Socket disconnected');
            this._setState(Socket.STATE_DISCONNECTED);
        });
        this._socket.on('handshake', (data) => {
            console.log('handshake success');
        });
        this._events.forEach(event => this._socket.on(event, data => this._handleEvent(event, data)));
    }

    /**
     * Emits the data.
     *
     * @param {string} event
     * @param {any} data
     */
    emit(event, data) {
        if (!this.isConnected()) {
            throw new Error('Socket not connected');
        }
        if (this._events.indexOf(event) < 0) {
            console.warn(`Unknown socket event '${event}'`);
        }
        if (__DEV__) {
            console.log(`Emit '${event}'`, data);
        }
        this._socket.emit(event, data);
        return this;
    }

    /**
     * Gets the current state of the socket.
     */
    getState() {
        return this._state;
    }

    /**
     * Checks if socket is in connected state.
     */
    isConnected() {
        return this._state === Socket.STATE_CONNECTED;
    }

    /**
     * Sets the state of the socket and calls 'state' event of CallbackEmitter.
     * @param {*} state
     */
    _setState(state) {
        this._state = state;
        this._callListener('state', state);
    }

    _handleEvent(event, data) {
        if (__DEV__) {
            console.log(`Handling event '${event}'`, data);
        }
        if (data && data.error && __DEV__) {
            console.error('Socket error', data.error);
        }
        if (data && data._deprecated && __DEV__) {
            console.warn(`Event '${event}' is deprecated`);
        }
        this._callListener(event, data);
    }
}


export default new Socket();
