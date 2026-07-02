import {StyleSheet} from 'react-native';
import {responsiveDimension} from 'utils/helper';

const styles = StyleSheet.create({
  container: {
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
  section: {
    marginTop: responsiveDimension(10),
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: responsiveDimension(10),
  },
  label: {
    color: '#FFFFFF',
    fontSize: responsiveDimension(14),
    fontWeight: '800',
  },
  value: {
    color: '#FF3030',
    fontSize: responsiveDimension(14),
    fontWeight: '900',
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: responsiveDimension(10),
  },
  optionButton: {
    minWidth: responsiveDimension(96),
    minHeight: responsiveDimension(48),
    borderRadius: responsiveDimension(14),
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: '#101010',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: responsiveDimension(14),
    paddingVertical: responsiveDimension(10),
  },
  selectedButton: {
    backgroundColor: '#C91D24',
    borderColor: 'rgba(255,255,255,0.16)',
  },
  optionText: {
    color: '#FFFFFF',
    fontSize: responsiveDimension(14),
    fontWeight: '800',
  },
  hint: {
    color: '#A8A8A8',
    fontSize: responsiveDimension(13),
    lineHeight: responsiveDimension(19),
    marginTop: responsiveDimension(14),
  },
});

export default styles;
