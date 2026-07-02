import {StyleSheet} from 'react-native';
import {responsiveDimension} from 'utils/helper';

const styles = StyleSheet.create({
  languageWrapper: {
    backgroundColor: '#050505',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: responsiveDimension(20),
  },
  title: {
    color: '#FFFFFF',
    fontSize: responsiveDimension(18),
    fontWeight: '800',
    marginBottom: responsiveDimension(14),
  },
  buttonRow: {
    flexDirection: 'row',
  },
  optionButton: {
    flex: 1,
    minHeight: responsiveDimension(54),
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: '#101010',
  },
  selectedButton: {
    backgroundColor: '#C91D24',
    borderColor: 'rgba(255,255,255,0.12)',
  },
  buttonSpacer: {
    width: responsiveDimension(12),
  },
  buttonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: responsiveDimension(14),
    paddingVertical: responsiveDimension(12),
  },
  iconFlag: {
    width: responsiveDimension(24),
    height: responsiveDimension(24),
    marginRight: responsiveDimension(8),
    borderRadius: responsiveDimension(12),
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: responsiveDimension(14),
    fontWeight: '700',
  },
});

export default styles;
