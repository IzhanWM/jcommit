"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.colorize = colorize;
exports.printInfo = printInfo;
exports.printSuccess = printSuccess;
exports.printWarning = printWarning;
exports.printError = printError;
const COLORS = {
    red: '\u001b[0;31m',
    green: '\u001b[0;32m',
    yellow: '\u001b[1;33m',
    blue: '\u001b[0;34m',
    reset: '\u001b[0m',
};
function colorize(color, message) {
    return `${COLORS[color]}${message}${COLORS.reset}`;
}
function printInfo(message) {
    console.log(colorize('blue', message));
}
function printSuccess(message) {
    console.log(colorize('green', message));
}
function printWarning(message) {
    console.warn(colorize('yellow', message));
}
function printError(message) {
    console.error(colorize('red', message));
}
//# sourceMappingURL=colors.js.map