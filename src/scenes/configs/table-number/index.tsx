import React, {memo} from 'react';

import Text from 'components/Text';
import TextInput from 'components/TextInput';
import View from 'components/View';
import i18n from 'i18n';

import TableNumberViewModel from './TableNumberViewModel';
import styles from './styles';

const TableNumber = () => {
  const viewModel = TableNumberViewModel();

  return (
    <View style={styles.container}>
      <Text color={'#FFFFFF'} style={styles.title}>{i18n.t('tableNumberConfig')}</Text>

      <Text color={'#A7A7A7'} style={styles.fieldLabel}>{i18n.t('tableNumber')}</Text>

      <TextInput
        containerStyle={styles.inputContainer}
        inputStyle={styles.input}
        placeholder={i18n.t('tableNumber')}
        placeholderTextColor={'#6F6F6F'}
        value={viewModel.tableNumber}
        onChange={viewModel.onChangeText}
        keyboardType={'numeric'}
      />
    </View>
  );
};

export default memo(TableNumber);
