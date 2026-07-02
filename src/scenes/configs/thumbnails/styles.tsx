import {StyleSheet} from 'react-native';
const styles = StyleSheet.create({
  container: {backgroundColor: '#050505', borderRadius: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', padding: 20},
  title: {color: '#FFFFFF', fontSize: 18, fontWeight: '800', marginBottom: 14},
  slotTitle: {color: '#A8A8A8', fontSize: 12, marginBottom: 10},
  row: {flexDirection: 'row'},
  rowGap: {width: 16},
  slotColumn: {flex: 1},
  toggleRow: {flexDirection: 'row', alignItems: 'center', marginTop: 10, justifyContent: 'space-between'},
  toggleLabel: {color: '#FFFFFF', fontSize: 14, fontWeight: '700'},
});
export default styles;
