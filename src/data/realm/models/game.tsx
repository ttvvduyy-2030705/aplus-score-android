import Realm, {BSON, ObjectSchema} from 'realm';
import {PlayerSettings} from 'types/player';
import {GameSettings, GameSettingsMode} from 'types/settings';

export class GameSettingsModeSchema extends Realm.Object<GameSettingsMode> {
  // _id!: BSON.ObjectId;
  mode!: string;
  extraTimeTurns?: string;
  countdownTime?: number;
  warmUpTime?: number;

  static schema: ObjectSchema = {
    name: 'GameSettingsMode',
    properties: {
      // _id: 'objectId',
      mode: 'string',
      extraTimeTurns: 'string?',
      countdownTime: 'int?',
      warmUpTime: 'int?',
    },
    // primaryKey: '_id',
  };
}

export class GameSchema extends Realm.Object<GameSettings> {
  id!: BSON.ObjectId;
  createdAt!: Date;
  updatedAt!: Date;
  totalTime!: number;
  category!: string;
  mode!: GameSettingsMode;
  players!: PlayerSettings;
  webcamFolderName?: string;

  static schema: ObjectSchema = {
    name: 'Game',
    properties: {
      id: 'objectId',
      updatedAt: {type: 'date'},
      createdAt: {type: 'date'},
      totalTime: 'int',
      category: {type: 'string'},
      mode: {type: 'object', objectType: 'GameSettingsMode'},
      players: {type: 'object', objectType: 'PlayerSettings'},
      webcamFolderName: 'string?',
    },
    // primaryKey: 'id',
  };
}
