import {StyleSheet} from 'react-native';
import {responsiveDimension, responsiveFontSize} from 'utils/helper';

const styles = StyleSheet.create({
  configIPWrapper: {
    backgroundColor: '#050505',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  sectionTitle: {color: '#FFFFFF', fontSize: 18, fontWeight: '800', marginBottom: 12},
  inputRow: {flexDirection: 'row', marginBottom: 12},
  inputColumn: {flex: 1},
  inputGap: {width: 12},
  inputLabel: {color: '#A8A8A8', fontSize: 12, marginBottom: 8},
  inputContainer: {borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', backgroundColor: '#111111', minHeight: 48},
  input: {fontSize: responsiveFontSize(13), color: '#FFFFFF', backgroundColor: '#111111', borderRadius: 16, marginHorizontal: responsiveDimension(0), marginLeft: 0},
  outputRow: {flexDirection: 'row', alignItems: 'center', marginTop: 14},
  outputLabel: {color: '#A8A8A8', fontSize: 12, marginRight: 12},
  outputActions: {flex: 1, flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap'},
  modeButton: {borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', borderRadius: 16, backgroundColor: '#111111', marginLeft: 8, marginBottom: 8},
  modeButtonActive: {backgroundColor: '#C91D24', borderColor: 'rgba(255,255,255,0.12)'},
  modeButtonInner: {paddingHorizontal: responsiveDimension(15), paddingVertical: responsiveDimension(10)},
  modeButtonText: {color: '#FFFFFF', fontSize: responsiveFontSize(12), fontWeight: '700'},
  slider: {flex: 1},
  sliderValue: {position: 'absolute', top: -18, borderRadius: 20, paddingHorizontal: 6},
  webcamContainer: {width: '100%', aspectRatio: 1.742, borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)'} ,
  webcam: {overflow: 'hidden', backgroundColor: '#000000'},
  buttonTest: {backgroundColor: '#111111', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', paddingHorizontal: responsiveDimension(20), paddingVertical: responsiveDimension(12), marginRight: responsiveDimension(12), borderRadius: 16},
  buttonSaveConfig: {backgroundColor: '#C91D24', paddingHorizontal: responsiveDimension(20), paddingVertical: responsiveDimension(12), borderRadius: 16},
  actionText: {color: '#FFFFFF', fontWeight: '800'},
});

export default styles;
