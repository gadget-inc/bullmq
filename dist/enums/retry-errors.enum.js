"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RetryErrors = void 0;
var RetryErrors;
(function (RetryErrors) {
    RetryErrors[RetryErrors["JobNotFailed"] = -2] = "JobNotFailed";
    RetryErrors[RetryErrors["JobIsActive"] = -1] = "JobIsActive";
    RetryErrors[RetryErrors["JobNotExist"] = 0] = "JobNotExist";
})(RetryErrors = exports.RetryErrors || (exports.RetryErrors = {}));
//# sourceMappingURL=retry-errors.enum.js.map