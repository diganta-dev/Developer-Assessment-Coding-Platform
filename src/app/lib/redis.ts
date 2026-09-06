import { createClient } from "redis";
import config from "../config";

const redisClient = createClient({
	username: config.redis.username,
	password: config.redis.password,
	socket: {
		host: config.redis.host,
		port: config.redis.port,
	},
});

redisClient.on("error", (err) => console.log("Redis Client Error:", err));

export const connectRedis = async () => {
	if (!redisClient.isOpen) {
		await redisClient.connect();
	}
};

export default redisClient;
