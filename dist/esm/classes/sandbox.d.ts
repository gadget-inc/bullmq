import { Job } from './job';
import { ChildPool } from '../classes';
declare const sandbox: <T, R, N extends string>(processFile: any, childPool: ChildPool) => (job: Job<T, R, N>) => Promise<R>;
export default sandbox;
