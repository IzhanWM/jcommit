"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.promptInput = promptInput;
exports.promptSecret = promptSecret;
exports.promptYesNo = promptYesNo;
const colors_1 = require("./colors");
async function promptInput(rl, question, options = {}) {
    const { required = false, defaultValue } = options;
    const suffix = defaultValue ? ` (${defaultValue})` : '';
    while (true) {
        const answer = (await rl.question(`${question}${suffix}: `)).trim();
        if (answer) {
            return answer;
        }
        if (!answer && defaultValue !== undefined) {
            return defaultValue;
        }
        if (!required) {
            return '';
        }
        (0, colors_1.printWarning)('Input cannot be empty.');
    }
}
async function promptSecret(rl, question, options = {}) {
    const { allowEmpty = false, hasExisting = false } = options;
    const hint = hasExisting ? ' (leave blank to keep current)' : '';
    while (true) {
        const answer = (await rl.question(`${question}${hint}: `)).trim();
        if (answer) {
            return answer;
        }
        if (allowEmpty && hasExisting) {
            return '';
        }
        if (!allowEmpty && !hasExisting) {
            (0, colors_1.printWarning)('Input cannot be empty.');
        }
        else {
            return '';
        }
    }
}
async function promptYesNo(rl, question) {
    while (true) {
        const answer = (await rl.question(`${question} (y/n): `)).trim().toLowerCase();
        if (['y', 'yes'].includes(answer)) {
            return true;
        }
        if (['n', 'no'].includes(answer)) {
            return false;
        }
        (0, colors_1.printWarning)('Please answer y or n.');
    }
}
//# sourceMappingURL=prompts.js.map