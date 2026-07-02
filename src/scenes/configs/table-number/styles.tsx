import {StyleSheet} from 'react-native';
import {responsiveFontSize} from 'utils/helper';

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#050505',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 20,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 14,
  },
  fieldLabel: {
    color: '#A7A7A7',
    fontSize: 12,
    marginBottom: 8,
  },
  inputContainer: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: '#111111',
    minHeight: 48,
  },
  input: {
    fontSize: responsiveFontSize(13),
    color: '#FFFFFF',
    backgroundColor: '#111111',
    borderRadius: 16,
  },
});

export default styles;
