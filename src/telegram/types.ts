import {
  type Conversation,
  type ConversationFlavor,
} from '@grammyjs/conversations';
import { User } from '@prisma/generated';
import { Context, SessionFlavor } from 'grammy';

export interface SessionData {
  user?: User;
  replyToMessageId?: number;
  moderateMessageId?: number;
}

export type MyContext = Context &
  SessionFlavor<SessionData> &
  ConversationFlavor<Context>;

export type MyConversation = Conversation<MyContext>;

export interface ConversationData {
  replyToMessageId?: number;
  moderateMessageId?: number;
}
