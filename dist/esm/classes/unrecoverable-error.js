/**
 * UnrecoverableError
 *
 * Error to move a job to failed even if the attemptsMade
 * are lower than the expected limit.
 *
 */
export class UnrecoverableError extends Error {
    constructor(message) {
        super(message);
        this.name = this.constructor.name;
        Object.setPrototypeOf(this, new.target.prototype);
    }
}
//# sourceMappingURL=unrecoverable-error.js.map