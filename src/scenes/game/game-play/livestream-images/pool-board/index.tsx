import React, {memo, useCallback} from 'react';
import LinearGradient from 'react-native-linear-gradient';
import View from 'components/View';
import Text from 'components/Text';
import Image from 'components/Image';
import colors from 'configuration/colors';

import {isPoolGame} from 'utils/game';
import images from 'assets';
import i18n from 'i18n';

import PoolBoardViewModel, {Props} from './PoolBoardViewModel';
import styles from './styles';

const PoolBoard = (props: Props) => {
  const viewModel = PoolBoardViewModel(props);

  const renderArrowTurn = useCallback(
    (index: number) => {
      if (index === props.currentPlayerIndex) {
        if (index === 0) {
          return (
            <Image source={images.game.turn} style={styles.imageTurnRight} />
          );
        }

        return <Image source={images.game.turn} style={styles.imageTurnLeft} />;
      }

      return <View style={styles.empty} />;
    },
    [props.currentPlayerIndex],
  );

  return (
    <View
      ref={viewModel.matchRef}
      style={styles.matchInfo}
      direction={'row'}
      collapsable={false}
      alignItems={'center'}>
      <View style={styles.whiteBlock} />
      <View
        style={styles.matchBackground}
        flex={'1'}
        direction={'row'}
        alignItems={'center'}>
        <View flex={'1'} direction={'row'} alignItems={'center'}>
          <View flex={'1'} justify={'center'} paddingHorizontal={'20'}>
            <Text
              fontWeight={'900'}
              fontSize={16}
              letterSpacing={2}
              color={colors.white}>
              {viewModel.player0?.name}
            </Text>
          </View>
          <View justify={'center'} paddingLeft={'15'} paddingRight={'5'}>
            <Text
              style={styles.matchPointText}
              fontWeight={'bold'}
              fontSize={32}
              color={colors.white}>
              {viewModel.player0?.totalPoint}
            </Text>
          </View>
          {renderArrowTurn(1)}
        </View>
        {isPoolGame(props.gameSettings?.category) ? (
          <LinearGradient colors={[colors.deepGray, colors.black]}>
            <View
              paddingHorizontal={'20'}
              justify={'center'}
              alignItems={'center'}
              style={styles.matchRace}>
              <Text fontSize={12} color={colors.white} fontWeight={'bold'}>
                {i18n.t('raceTo', {
                  goal: props.gameSettings?.players.goal.goal,
                })}
              </Text>
            </View>
          </LinearGradient>
        ) : (
          <LinearGradient colors={[colors.deepGray, colors.black]}>
            <View
              paddingHorizontal={'20'}
              justify={'center'}
              alignItems={'center'}
              style={styles.matchRace}>
              <Text fontSize={12} color={colors.white} fontWeight={'bold'}>
                {i18n.t('goal', {
                  goal: props.gameSettings?.players.goal.goal,
                })}
              </Text>
            </View>
          </LinearGradient>
        )}
        <View flex={'1'} direction={'row'} alignItems={'center'}>
          {renderArrowTurn(0)}
          <View justify={'center'} paddingRight={'15'} paddingLeft={'5'}>
            <Text
              style={styles.matchPointText}
              fontWeight={'bold'}
              fontSize={32}
              color={colors.white}>
              {viewModel.player1?.totalPoint}
            </Text>
          </View>
          <View
            flex={'1'}
            alignItems={'end'}
            justify={'center'}
            paddingHorizontal={'20'}>
            <Text fontWeight={'bold'} color={colors.white}>
              {viewModel.player1?.name}
            </Text>
          </View>
        </View>
      </View>
      <View style={styles.blackBlock} />
    </View>
  );
};

export default memo(PoolBoard);