import React, {memo, useCallback} from 'react';
import {KeyboardTypeOptions, ScrollView, TextInput as RNTextInput} from 'react-native';
import Slider from '@react-native-community/slider';
import Button from 'components/Button';
import Text from 'components/Text';
import TextInput from 'components/TextInput';
import Video from 'components/Video';
import View from 'components/View';
import colors from 'configuration/colors';
import i18n from 'i18n';
import webcam from 'scenes/game/game-play/console/webcam';
import {OutputType, WebcamType} from 'types/webcam';
import WebcamConfigViewModel from './WebcamConfigViewModel';
import styles from './styles';

const WebcamConfig = () => {
  const viewModel = WebcamConfigViewModel();

  const renderInput = useCallback((title:string, value:string, placeholder:string, keyboardType:KeyboardTypeOptions, returnKeyType:'next'|'default', onChangeText:(value:string)=>void, opts:{inputRef?: React.RefObject<RNTextInput>; onSubmitEditing?: ()=>void; secureTextEntry?: boolean; secureTextView?: boolean;}) => (
    <View style={styles.inputColumn}>
      <Text color={'#A8A8A8'} style={styles.inputLabel}>{title}</Text>
      <TextInput ref={opts.inputRef} containerStyle={styles.inputContainer} inputStyle={styles.input} value={value} placeholder={placeholder} placeholderTextColor={'#6F6F6F'} onChange={onChangeText} onSubmitEditing={opts.onSubmitEditing} secureTextEntry={opts.secureTextEntry} keyboardType={keyboardType} returnKeyType={returnKeyType} secureTextView={opts.secureTextView} />
    </View>
  ), []);

  const renderModeButton = useCallback((label:string, selected:boolean, onPress:()=>void) => (
    <Button style={[styles.modeButton, selected && styles.modeButtonActive]} onPress={onPress}>
      <View style={styles.modeButtonInner}><Text color={'#FFFFFF'} style={styles.modeButtonText}>{label}</Text></View>
    </Button>
  ), []);

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <View style={styles.configIPWrapper} paddingVertical={'20'}>
        <Text color={'#FFFFFF'} style={styles.sectionTitle}>{i18n.t('webcamConfig')}</Text>
        <View marginBottom={'14'}>
          <Text color={'#A8A8A8'} fontSize={12}>{i18n.t('txtWebcamSyncTime')} {viewModel.webcam.syncTime <= 10 ? `(${i18n.t('txtAffectPerformance')})` : ''}</Text>
        </View>
        <View direction={'row'} alignItems={'center'} marginBottom={'16'}>
          <Text fontSize={12} color={'#7A7A7A'}>{3}s</Text>
          <View flex={'1'} direction={'row'}>
            <Slider style={styles.slider} value={viewModel.webcam.syncTime} minimumValue={3} maximumValue={60} step={1} thumbTintColor={viewModel.sliderColor} minimumTrackTintColor={viewModel.sliderColor} maximumTrackTintColor={colors.deepGray} onValueChange={viewModel.onChangeSyncTime} />
            <View style={[styles.sliderValue, viewModel.sliderValueStyle, {backgroundColor: viewModel.sliderColor}]}><Text fontSize={12} color={'#FFFFFF'}>{viewModel.webcam.syncTime < 10 ? `0${viewModel.webcam.syncTime}` : viewModel.webcam.syncTime}</Text></View>
          </View>
          <Text fontSize={12} color={'#7A7A7A'}>{60}s</Text>
        </View>
        <View style={styles.inputRow}>
          {renderInput(i18n.t('webcamIP'), viewModel.webcam.webcamIP, i18n.t('txtEnterWebcamIPAddress'), 'numeric', 'next', viewModel.onChangeIPAddress, {onSubmitEditing: viewModel.onSubmitEditingIPAddress})}
          <View style={styles.inputGap} />
          {renderInput(i18n.t('username'), viewModel.webcam.username, i18n.t('txtEnterUsername'), 'default', 'next', viewModel.onChangeUsername, {inputRef: viewModel.userNameRef, onSubmitEditing: viewModel.onSubmitEditingUsername})}
          <View style={styles.inputGap} />
          {renderInput(i18n.t('password'), viewModel.webcam.password, i18n.t('txtEnterPassword'), 'default', 'default', viewModel.onChangePassword, {inputRef: viewModel.passwordRef, secureTextEntry: true, secureTextView: true})}
        </View>
        <View style={styles.outputRow}>
          <Text color={'#A8A8A8'} style={styles.outputLabel}>{i18n.t('txtChooseOutputType')}</Text>
          <View style={styles.outputActions}>
            {renderModeButton(i18n.t('local'), true, () => viewModel.onSelectOutputTypeLocal('local'))}
          </View>
        </View>
        <View direction={'row'} justify={'end'} marginTop={'20'}>
          <Button onPress={viewModel.onTest} style={styles.buttonTest}><View paddingHorizontal={'5'}><Text color={'#FFFFFF'} style={styles.actionText}>{i18n.t('test')}</Text></View></Button>
          <Button disable={!viewModel.allowToSave} onPress={viewModel.onSaveConfig} style={styles.buttonSaveConfig}><View paddingHorizontal={'5'}><Text color={'#FFFFFF'} style={styles.actionText}>{i18n.t('saveConfig')}</Text></View></Button>
        </View>
        <View marginTop={'20'} />
        {viewModel.webcamUrl ? <View style={styles.webcamContainer}><View flex={'1'} style={styles.webcam} direction={'row'} marginTop={'10'}><View flex={'1'}><Video webcamType={WebcamType.webcam} key={'webcam-billiards-test'} ref={viewModel.videoRef} source={viewModel.source} initialScale={viewModel.webcam.scale} initialTranslateX={viewModel.webcam.translateX} initialTranslateY={viewModel.webcam.translateY} onLoad={viewModel.onLoad} onError={viewModel.onWebcamError} onPosition={viewModel.onSaveWebcamPosition} isStarted={false} isPaused={false} isPreview={false} setIsCameraReady={function (_isReady: boolean): void { throw new Error('Function not implemented.'); }} /></View></View></View> : <View />}
      </View>
    </ScrollView>
  );
};

export default memo(WebcamConfig);
