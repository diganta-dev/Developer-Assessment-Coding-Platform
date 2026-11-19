import { OAuth2Client } from "google-auth-library";
import config from "../config/index.js";

export const googleClient = new OAuth2Client(config.google_client_id);
