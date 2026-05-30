import type Anthropic from '@anthropic-ai/sdk';

type CacheableTool = Anthropic.Tool & { cache_control?: { type: 'ephemeral' } };

export const toolDefinitions: CacheableTool[] = [
  {
    name: 'get_available_players',
    description: 'List all players available for selection in this club.',
    input_schema: {
      type: 'object',
      properties: {
        matchFormat: {
          type: 'string',
          enum: ['T20', 'ODI', '50over', '40over', 'club'],
          description: 'Format of the upcoming match.',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_player_stats',
    description: 'Get career statistics for a specific player.',
    input_schema: {
      type: 'object',
      properties: {
        playerId: { type: 'string', description: 'Player ID.' },
      },
      required: ['playerId'],
    },
  },
  {
    name: 'get_player_form',
    description: 'Get recent match performance and form trend for a player.',
    input_schema: {
      type: 'object',
      properties: {
        playerId: { type: 'string', description: 'Player ID.' },
        lastNMatches: {
          type: 'number',
          description: 'Number of recent matches to include. Default 5.',
        },
      },
      required: ['playerId'],
    },
  },
  {
    name: 'get_batting_insights',
    description:
      'Get detailed batting analysis: scoring zones, wagon wheel data, strengths vs pace/spin.',
    input_schema: {
      type: 'object',
      properties: {
        playerId: { type: 'string', description: 'Player ID.' },
      },
      required: ['playerId'],
    },
  },
  {
    name: 'get_bowling_insights',
    description: 'Get detailed bowling analysis: economy, wicket types, and pitch map data.',
    input_schema: {
      type: 'object',
      properties: {
        playerId: { type: 'string', description: 'Player ID.' },
      },
      required: ['playerId'],
    },
  },
  {
    name: 'get_head_to_head',
    description: 'Get head-to-head record between a specific batsman and bowler.',
    input_schema: {
      type: 'object',
      properties: {
        batsmanId: { type: 'string', description: 'Batsman player ID.' },
        bowlerId: { type: 'string', description: 'Bowler player ID.' },
      },
      required: ['batsmanId', 'bowlerId'],
    },
  },
  {
    name: 'get_match_context',
    description: 'Get upcoming match context: venue, pitch conditions, and opponent squad.',
    input_schema: {
      type: 'object',
      properties: {
        matchId: { type: 'string', description: 'Match ID.' },
      },
      required: ['matchId'],
    },
    cache_control: { type: 'ephemeral' },
  },
];
