import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const _filename = fileURLToPath(import.meta.url);
const _dirname = path.dirname(_filename);

dotenv.config({ path: path.resolve(_dirname, "../../../.env") });

export default {
    PORT: process.env.PORT,
    ORIGIN_PORT: process.env.ORIGIN_PORT,
    ORIGIN_URL: process.env.ORIGIN_URL,
    MYSQL_HOST: process.env.MYSQL_HOST,
    MYSQL_PORT: process.env.MYSQL_PORT,
    MYSQL_USER: process.env.MYSQL_USER,
    MYSQL_PASSWORD: process.env.MYSQL_PASSWORD,
    MYSQL_DATABASE: process.env.MYSQL_DATABASE,
    CACHE_TTL_SEC: process.env.CACHE_TTL_SEC,
    CACHE_MAX_SIZE_MB: process.env.CACHE_MAX_SIZE_MB
};