import { Schema, type FunctionDeclaration } from 'firebase/ai';

// Gemini function declarations for the cricket assistant.
// DATA ONLY — these surface stats to the model; all reasoning happens in the LLM.
export const functionDeclarations: FunctionDeclaration[] = [
  {
    name: 'get_available_players',
    description: 'List players available for selection. When a matchId is provided, returns only players in that match\'s squad; otherwise returns all club players.',
    parameters: Schema.object({
      properties: {
        matchFormat: Schema.enumString({
          enum: ['T20', 'ODI', '50over', '40over', 'club'],
          description: 'Format of the upcoming match.',
        }),
        matchId: Schema.string({
          description: 'Match ID to restrict results to that match\'s squad.',
        }),
      },
      optionalProperties: ['matchFormat', 'matchId'],
    }),
  },
  {
    name: 'get_player_stats',
    description: 'Get career statistics for a specific player.',
    parameters: Schema.object({
      properties: {
        playerId: Schema.string({ description: 'Player ID.' }),
      },
    }),
  },
  {
    name: 'get_player_form',
    description: 'Get recent match performance and form trend for a player.',
    parameters: Schema.object({
      properties: {
        playerId: Schema.string({ description: 'Player ID.' }),
        lastNMatches: Schema.integer({
          description: 'Number of recent matches to include. Default 5.',
        }),
      },
      optionalProperties: ['lastNMatches'],
    }),
  },
  {
    name: 'get_batting_insights',
    description:
      'Get detailed batting analysis: scoring zones, wagon wheel data, strengths vs pace/spin.',
    parameters: Schema.object({
      properties: {
        playerId: Schema.string({ description: 'Player ID.' }),
      },
    }),
  },
  {
    name: 'get_bowling_insights',
    description: 'Get detailed bowling analysis: economy, wicket types, and pitch map data.',
    parameters: Schema.object({
      properties: {
        playerId: Schema.string({ description: 'Player ID.' }),
      },
    }),
  },
  {
    name: 'get_head_to_head',
    description: 'Get head-to-head record between a specific batsman and bowler.',
    parameters: Schema.object({
      properties: {
        batsmanId: Schema.string({ description: 'Batsman player ID.' }),
        bowlerId: Schema.string({ description: 'Bowler player ID.' }),
      },
    }),
  },
  {
    name: 'get_match_context',
    description: 'Get upcoming match context: venue, pitch conditions, and opponent squad.',
    parameters: Schema.object({
      properties: {
        matchId: Schema.string({ description: 'Match ID.' }),
      },
    }),
  },
];
