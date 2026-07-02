import AsyncStorage from '@react-native-async-storage/async-storage';
import {keys} from 'configuration/keys';
import {useCallback, useEffect, useMemo, useState} from 'react';

const TableNumberViewModel = () => {
  const [tableNumber, setTableNumber] = useState('');

  useEffect(() => {
    AsyncStorage.getItem(keys.TABLE_NUMBER).then(result => {
      if (!result) {
        return;
      }

      setTableNumber(result);
    });
  }, []);

  const onChangeText = useCallback((value: string) => {
    setTableNumber(value);
    AsyncStorage.setItem(keys.TABLE_NUMBER, value);
  }, []);

  return useMemo(() => {
    return {tableNumber, onChangeText};
  }, [tableNumber, onChangeText]);
};

export default TableNumberViewModel;
