export interface ICompanyPayload {
  name: string;
  email: string;
  logoUrl?: string;
  description?: string;
  website?: string;
  userId?: string;
}
export interface IVerifyCompanyPayload {
		email: string;
		otp: string;
	}
 
export type IUpdateCompanyPayload = Partial<ICompanyPayload>;