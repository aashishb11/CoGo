export const EXTERNAL_EVENT_PROVIDERS = ['cultucat'] as const;
export type ExternalEventProvider = (typeof EXTERNAL_EVENT_PROVIDERS)[number];

export const CULTUCAT_PROVIDER: ExternalEventProvider = 'cultucat';

export interface ExternalEventContext {
  provider: ExternalEventProvider;
  eventId: string;
}
