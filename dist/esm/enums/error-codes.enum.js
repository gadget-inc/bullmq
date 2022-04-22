export var ErrorCodes;
(function (ErrorCodes) {
    ErrorCodes[ErrorCodes["JobNotExist"] = -1] = "JobNotExist";
    ErrorCodes[ErrorCodes["JobLockNotExist"] = -2] = "JobLockNotExist";
    ErrorCodes[ErrorCodes["JobNotInState"] = -3] = "JobNotInState";
    ErrorCodes[ErrorCodes["JobPendingDependencies"] = -4] = "JobPendingDependencies";
    ErrorCodes[ErrorCodes["ParentJobNotExist"] = -5] = "ParentJobNotExist";
})(ErrorCodes || (ErrorCodes = {}));
//# sourceMappingURL=error-codes.enum.js.map