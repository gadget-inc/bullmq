import { Job } from './job';
declare const sandbox: <T, R, N extends string>(processFile: any, childPool: any) => (job: Job<T, R, N>) => Promise<R>;
export default sandbox;
