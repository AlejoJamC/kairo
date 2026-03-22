export interface EmailMessage {
  subject: string;
  body: string;
  from: string;
  date?: Date;
}
