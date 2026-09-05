import type { UserRole } from "../../../generated/prisma/enums";

export interface ILoginUserPayload {
	email: string;
	password: string;
}

export interface IRegisterUserPayload {
	name: string;
	email: string;
	password: string;
	role?: UserRole;
}

export interface IRequestUser {
	userId: string;
	email: string;
	name: string;
	role: UserRole;
}
