import { Redis, RedisOptions as BaseRedisOptions, Cluster } from 'ioredis';
export declare type RedisOptions = BaseRedisOptions & {
    skipVersionCheck?: boolean;
};
export declare type ConnectionOptions = RedisOptions | Redis | Cluster;
