export interface ICompanyPayload {
  name: string;
  email: string;
  profilePictureUrl?: string;
  description?: string;
  website?: string;
  
}
 
export type IUpdateCompanyPayload = Partial<ICompanyPayload>;