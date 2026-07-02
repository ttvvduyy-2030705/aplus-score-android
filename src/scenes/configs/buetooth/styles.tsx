import colors from 'configuration/colors';
import {StyleSheet} from 'react-native';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 0,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 12,
  },
  message: {
    color: '#D8D8D8',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 10,
  },
  errorText: {
    color: 'red',
    textAlign: 'center',
    marginVertical: 16,
  },
  deviceText: {
    marginVertical: 8,
    fontSize: 16,
  },
  button: {
    borderWidth: 0.5,
    borderColor: colors.gray,
    borderRadius: 16,
    marginTop: 8,
  },
  info: {
    marginVertical: 16,
  },
});

export default styles;
