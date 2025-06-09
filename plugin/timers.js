/*
Hack to fix wonky timers in StreamDeck core by overwriting timer methods with custom worker thread

Source: https://github.com/elgatosf/streamdeck-timerfix

License: The MIT License

Copyright 2021 Corsair Memory, Inc

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

/* global ESDTimerWorker */
/*eslint no-unused-vars: "off"*/
/*eslint-env es6*/

let ESDTimerWorker = new Worker(URL.createObjectURL(
    new Blob([timerFn.toString().replace(/^[^{]*{\s*/, '').replace(/\s*}[^}]*$/, '')], {type: 'text/javascript'})
));
ESDTimerWorker.timerId = 1;
ESDTimerWorker.timers = {};
const ESDDefaultTimeouts = {
    timeout: 0,
    interval: 10
};

Object.freeze(ESDDefaultTimeouts);

function _setTimer(callback, delay, type, params) {
    const id = ESDTimerWorker.timerId++;
    ESDTimerWorker.timers[id] = {callback, params};
    ESDTimerWorker.onmessage = (e) => {
        if(ESDTimerWorker.timers[e.data.id]) {
            if(e.data.type === 'clearTimer') {
                delete ESDTimerWorker.timers[e.data.id];
            } else {
                const cb = ESDTimerWorker.timers[e.data.id].callback;
                if(cb && typeof cb === 'function') cb(...ESDTimerWorker.timers[e.data.id].params);
            }
        }
    };
    ESDTimerWorker.postMessage({type, id, delay});
    return id;
}

function _setTimeoutESD(...args) {
    let [callback, delay = 0, ...params] = [...args];
    return _setTimer(callback, delay, 'setTimeout', params);
}

function _setIntervalESD(...args) {
    let [callback, delay = 0, ...params] = [...args];
    return _setTimer(callback, delay, 'setInterval', params);
}

function _clearTimeoutESD(id) {
    ESDTimerWorker.postMessage({type: 'clearTimeout', id}); //     ESDTimerWorker.postMessage({type: 'clearInterval', id}); = same thing
    delete ESDTimerWorker.timers[id];
}

window.setTimeout = _setTimeoutESD;
window.setInterval = _setIntervalESD;
window.clearTimeout = _clearTimeoutESD; //timeout and interval share the same timer-pool
window.clearInterval = _clearTimeoutESD;

/** This is our worker-code
 *  It is executed in it's own (global) scope
 *  which is wrapped above @ `let ESDTimerWorker`
 */

function timerFn() {
    /*eslint indent: ["error", 4, { "SwitchCase": 1 }]*/

    let timers = {};
    let debug = false;
    let supportedCommands = ['setTimeout', 'setInterval', 'clearTimeout', 'clearInterval'];

    function log(e) {console.log('Worker-Info::Timers', timers);}

    function clearTimerAndRemove(id) {
        if(timers[id]) {
            if(debug) console.log('clearTimerAndRemove', id, timers[id], timers);
            clearTimeout(timers[id]);
            delete timers[id];
            postMessage({type: 'clearTimer', id: id});
            if(debug) log();
        }
    }

    onmessage = function(e) {
        // first see, if we have a timer with this id and remove it
        // this automatically fulfils clearTimeout and clearInterval
        supportedCommands.includes(e.data.type) && timers[e.data.id] && clearTimerAndRemove(e.data.id);
        if(e.data.type === 'setTimeout') {
            timers[e.data.id] = setTimeout(() => {
                postMessage({id: e.data.id});
                clearTimerAndRemove(e.data.id); //cleaning up
            }, Math.max(e.data.delay || 0));
        } else if(e.data.type === 'setInterval') {
            timers[e.data.id] = setInterval(() => {
                postMessage({id: e.data.id});
            }, Math.max(e.data.delay || ESDDefaultTimeouts.interval));
        }
    };
}