import {StyleSheet} from 'react-native';
import {responsiveDimension} from 'utils/helper';
const styles = StyleSheet.create({
  container: {flexWrap: 'wrap'},
  item: {borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', overflow: 'hidden', backgroundColor: '#111111'},
  image: {width: responsiveDimension(64), height: responsiveDimension(64)},
  closeButton: {position: 'absolute', top: -10, right: -10, backgroundColor: '#C91D24', padding: responsiveDimension(8), borderRadius: 16},
  closeImage: {tintColor: '#FFFFFF', width: responsiveDimension(10), height: responsiveDimension(10)},
  addButton: {backgroundColor: '#111111', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', padding: responsiveDimension(16), borderRadius: 12, marginLeft: responsiveDimension(10)},
  addImage: {tintColor: '#FFFFFF', width: responsiveDimension(42), height: responsiveDimension(42)},
});
export default styles;
