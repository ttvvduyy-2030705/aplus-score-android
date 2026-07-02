export type AplusLiveScoreConfig = {
  enabled?: boolean;
  tournamentId?: string;
  tournamentName?: string;
  matchId?: string;
  matchNumber?: string;
  sessionToken?: string;
  lockExpiresAt?: string;
  rawMatch?: any;
};

export type AplusTournament = any;
export type AplusLiveMatch = any;

export const fetchAplusTournaments = async (): Promise<AplusTournament[]> => [];
export const fetchAplusMatchByNumber = async (): Promise<AplusLiveMatch | null> => null;
export const lockAplusLiveScoreMatch = async <T>(match: T): Promise<T> => match;
export const heartbeatAplusLiveScoreMatch = async () => null;
export const pushAplusLiveScoreUpdate = async () => null;
export const finishAplusLiveScoreMatch = async () => null;
export const releaseAplusLiveScoreMatch = async () => null;
