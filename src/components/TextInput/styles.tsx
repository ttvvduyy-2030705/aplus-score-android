import {StyleSheet} from 'react-native';

import colors from 'configuration/colors';
import {responsiveDimension} from 'utils/helper';

const radius = responsiveDimension(10);
const horizontalInset = responsiveDimension(16);

const styles = StyleSheet.create({
  flex: {
    flexDirection: 'row',
  },
  container: {
    flex: 1,
    minHeight: responsiveDimension(38),
    flexDirection: 'row',
    alignItems: 'center',
  },
  containerFullHeight: {
    flex: 1,
    height: '100%',
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    flex: 13,
    height: '100%',
    borderTopLeftRadius: radius,
    borderBottomLeftRadius: radius,
    backgroundColor: colors.white,
    paddingHorizontal: responsiveDimension(10),
    marginLeft: horizontalInset,
    paddingVertical: 0,
  },
  textArea: {
    flex: 1,
    height: '100%',
    borderRadius: radius,
    backgroundColor: colors.white,
    padding: responsiveDimension(10),
    marginHorizontal: horizontalInset,
  },
  flexInput: {
    flex: 1,
    height: '100%',
    marginHorizontal: horizontalInset,
    borderRadius: radius,
    backgroundColor: colors.white,
    paddingHorizontal: responsiveDimension(10),
    paddingVertical: 0,
  },
  cancelInputWrapper: {
    flex: 1,
    height: '100%',
    paddingRight: responsiveDimension(10),
    alignItems: 'flex-end',
    justifyContent: 'center',
    backgroundColor: colors.white,
    borderTopRightRadius: radius,
    borderTopLeftRadius: 0,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: radius,
    marginRight: horizontalInset,
  },
  cancelInputIcon: {
    width: responsiveDimension(15),
    height: responsiveDimension(15),
  },
  emptyView: {
    height: responsiveDimension(15),
  },
  error: {
    borderWidth: 1,
    borderBottomWidth: 1,
    borderBottomColor: colors.error,
    borderColor: colors.error,
  },
  txtError: {
    position: 'absolute',
    left: horizontalInset,
    bottom: -responsiveDimension(20),
  },
  marginBottom: {
    marginBottom: responsiveDimension(15),
  },
  backgroundWhite: {
    backgroundColor: colors.white,
  },
});

export default styles;
