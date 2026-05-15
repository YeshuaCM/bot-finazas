// =============================================================================
// Groq Client - Singleton
// =============================================================================
// Single shared Groq client instance to avoid multiple initializations.
// Both nlp-parser and ai-agent import from here.

import Groq from 'groq-sdk';
import { config } from '../config';

let client: Groq | null = null;

export function getGroqClient(): Groq {
  if (!client) {
    client = new Groq({ apiKey: config.groq.apiKey });
  }
  return client;
}
