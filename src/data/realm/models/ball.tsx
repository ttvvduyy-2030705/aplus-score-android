import Realm, {ObjectSchema} from 'realm';
import {PoolBallType} from 'types/ball';

export class PoolBallSchema extends Realm.Object<PoolBallType> {
  // _id!: BSON.ObjectId;
  number!: string;
  color!: string;
  cut!: boolean;

  static schema: ObjectSchema = {
    name: 'PoolBall',
    properties: {
      // _id: 'objectId',
      number: 'string',
      color: 'string',
      cut: 'bool',
    },
    // primaryKey: '_id',
  };
}
