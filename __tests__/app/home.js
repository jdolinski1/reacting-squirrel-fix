import React from 'react';

import { Page } from '../../app';

import './home.css';
import './home.scss';

export default class Home extends Page {

    state = {
        user: null,
    };

    componentDidMount() {
        super.componentDidMount();
        this.emit('user.get');
        this.on('user.get', (err, user) => {
            if (err) {
                console.error(err);
                return;
            }
            this.setState({ user });
        });
    }

    render() {
        const { user } = this.state;
        return (
            <div className="home-wrapper">
                <h1>HOME</h1>
                <h2>{user ? user.name : '...'}</h2>
            </div>
        );
    }
}
