const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, 'content.js'), 'utf8');
const start = source.indexOf('    function watchAadhaarInputs() {');
const end = source.indexOf('\n    watchAadhaarInputs();', start);
assert.notEqual(start, -1, 'Aadhaar input watcher must exist');
assert.notEqual(end, -1, 'Aadhaar input watcher must be invoked');

const watcherSource = `${source.slice(start, end)}\nwatchAadhaarInputs();`;
const syntheticValidAadhaar = '123456789006';

function createHarness() {
    const listeners = new Map();
    const sessionValues = new Map();
    const localValues = new Map();
    const document = {
        onbeforeinput: null,
        addEventListener(type, handler) {
            if (!listeners.has(type)) listeners.set(type, []);
            listeners.get(type).push(handler);
        },
        querySelectorAll() { return []; }
    };
    const storage = values => ({
        setItem(key, value) { values.set(key, String(value)); },
        getItem(key) { return values.get(key) || null; }
    });
    const context = vm.createContext({
        document,
        window: {},
        sessionStorage: storage(sessionValues),
        localStorage: storage(localValues),
        setTimeout,
        Date,
        String,
        Number,
        Math,
        JSON
    });
    vm.runInContext(watcherSource, context);

    return {
        sessionValues,
        listeners,
        input: {
            tagName: 'INPUT',
            type: 'text',
            name: 'aadhaar',
            id: 'aadhaar',
            placeholder: '',
            value: '',
            selectionStart: 0,
            selectionEnd: 0,
            dataset: {},
            parentElement: null,
            getAttribute() { return ''; }
        }
    };
}

function dispatch(harness, eventType, event) {
    for (const listener of harness.listeners.get(eventType) || []) listener(event);
}

test('typed digits are counted once and validated against the visible source value', () => {
    const harness = createHarness();
    for (let index = 0; index < syntheticValidAadhaar.length; index += 1) {
        const digit = syntheticValidAadhaar[index];
        dispatch(harness, 'beforeinput', {
            target: harness.input,
            isTrusted: true,
            inputType: 'insertText',
            data: digit
        });
        dispatch(harness, 'keydown', {
            target: harness.input,
            isTrusted: true,
            key: digit
        });
        harness.input.value = `XXXX-XXXX-${syntheticValidAadhaar.slice(Math.max(0, index - 3), index + 1)}`;
        harness.input.selectionStart = harness.input.value.length;
        harness.input.selectionEnd = harness.input.value.length;
    }

    dispatch(harness, 'input', { target: harness.input, isTrusted: true });
    dispatch(harness, 'change', { target: harness.input, isTrusted: true });
    assert.equal(harness.input._cm_aadhaar_buf, syntheticValidAadhaar);
    assert.ok(harness.sessionValues.has('cm_aadhaar_9006'), JSON.stringify({
        value: harness.input.value,
        buffer: harness.input._cm_aadhaar_buf,
        visible: harness.input.value.replace(/\D/g, ''),
        records: Array.from(harness.sessionValues.keys())
    }));
    const stored = JSON.parse(harness.sessionValues.get('cm_aadhaar_9006'));
    assert.equal(stored.fullAadhaar, syntheticValidAadhaar);
});

test('pasted digits are not accepted until the resulting input value matches', () => {
    const harness = createHarness();
    dispatch(harness, 'paste', {
        target: harness.input,
        isTrusted: true,
        clipboardData: { getData: () => syntheticValidAadhaar }
    });
    assert.equal(harness.sessionValues.size, 0);

    harness.input.value = 'XXXX-XXXX-9999';
    dispatch(harness, 'input', { target: harness.input, isTrusted: true });
    assert.equal(harness.sessionValues.size, 0);

    harness.input.value = 'XXXX-XXXX-9006';
    dispatch(harness, 'input', { target: harness.input, isTrusted: true });
    assert.equal(JSON.parse(harness.sessionValues.get('cm_aadhaar_9006')).fullAadhaar, syntheticValidAadhaar);
});
