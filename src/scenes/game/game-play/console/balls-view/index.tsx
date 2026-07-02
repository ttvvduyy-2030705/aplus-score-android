import Button from 'components/Button';
import Text from 'components/Text';
import View from 'components/View';
import colors from 'configuration/colors';
import i18n from 'i18n';
import React, {memo, useMemo} from 'react';
import {PoolBallType} from 'types/ball';
import {Player} from 'types/player';
import {GameSettings} from 'types/settings';
import {isPool15Game, isPool15OnlyGame} from 'utils/game';
import styles from './styles';
import {BALLS_15} from 'constants/balls';
import images from 'assets';
import Ball from 'components/Ball';
import {ScrollView} from 'react-native';
import Image from 'components/Image';
import useAdaptiveLayout from 'scenes/game/useAdaptiveLayout';

interface Props {
  isStarted: boolean;
  winner?: Player;
  gameSettings: GameSettings;
  balls: PoolBallType[];
  ballLeft: PoolBallType;
  ballRight: PoolBallType;
  colorLeft: string;
  colorRight: string;
  arrowColorLeft: string;
  arrowColorRight: string;
  pool15OnlyPointLeft: number;
  pool15OnlyPointRight: number;
  poolBreakEnabled: boolean;
  onSelectBall: (selectedBall: PoolBallType) => void;
  onPressGiveMoreTime: () => void;
  onSwapPlayers: () => void;
  onPoolBreak: () => void;
  onRestart: () => void;
  onResetTurn: () => void;
}

const BallsView = (props: Props) => {
  const adaptive = useAdaptiveLayout();
  const arrowStyle = useMemo(() => ({width: adaptive.s(26), height: adaptive.s(26)}), [adaptive]);
  const RACE_TO_GOAL = useMemo(() => {
    return (
      <Text fontSize={48}>
        {i18n.t('raceTo', {goal: props.gameSettings.players.goal.goal})}
      </Text>
    );
  }, [props]);

  if (props.winner) {
    return (
      <View flex={'1'} marginBottom={'15'} style={styles.ballPool15OnlyWrapper}>
        <View flex={'1'} />
        <View direction={'row'}>
          <View flex={'1'} alignItems={'center'} justify={'center'}>
            <Text fontSize={24}>
              {i18n.t('msgPool15OnlyWinner', {
                name: props.winner.name,
              })}
            </Text>
          </View>
        </View>
        <View
          flex={'1'}
          direction={'row'}
          justify={'center'}
          alignItems={'end'}
          marginBottom={'15'}>
          <View
            style={styles.buttonWrapper}
            flex={'1'}
            direction={'row'}
            alignItems={'center'}>
            <Button
              style={[styles.button, styles.buttonRestart]}
              onPress={props.onRestart}>
              <Text color={colors.white}>{i18n.t('restart')}</Text>
            </Button>
          </View>
        </View>
      </View>
    );
  }

  if (isPool15OnlyGame(props.gameSettings.category)) {
    return (
      <View flex={'1'} marginBottom={'15'} style={styles.ballPool15OnlyWrapper}>
        <View flex={'1'} />

        <View flex={'1'} direction={'row'} alignItems={'center'}>
          <View flex={'1'}>
            <View
              paddingRight={'10'}
              paddingVertical={'10'}
              style={[
                styles.ballsLeft,
                {
                  backgroundColor: props.colorLeft,
                  paddingLeft: `${props.pool15OnlyPointLeft * 2.8}%`,
                },
              ]}>
              <View direction={'row'} alignItems={'center'}>
                <View marginRight={'10'}>
                  <Text fontSize={56}>{props.pool15OnlyPointLeft}</Text>
                </View>
                <Ball data={props.ballLeft} onPress={props.onSelectBall} />
                <View direction={'row'} alignItems={'center'}>
                  <Image
                    source={images.doubleArrow}
                    style={[
                      styles.doubleArrowLeft,
                      arrowStyle,
                      {tintColor: props.arrowColorLeft},
                    ]}
                    resizeMode={'contain'}
                  />
                </View>
              </View>
            </View>
          </View>
          <View>
            <Ball data={BALLS_15[7]} onPress={props.onSelectBall} />
          </View>
          <View flex={'1'} alignItems={'end'}>
            <View
              paddingVertical={'10'}
              paddingLeft={'10'}
              style={[
                styles.ballsRight,
                {
                  backgroundColor: props.colorRight,
                  paddingRight: `${props.pool15OnlyPointRight * 2.8}%`,
                },
              ]}>
              <View direction={'row'} alignItems={'center'}>
                <View direction={'row'} alignItems={'center'}>
                  <Image
                    source={images.doubleArrow}
                    style={[
                      styles.doubleArrowRight,
                      arrowStyle,
                      {tintColor: props.arrowColorRight},
                    ]}
                    resizeMode={'contain'}
                  />
                </View>
                <Ball data={props.ballRight} onPress={props.onSelectBall} />
                <View marginLeft={'10'}>
                  <Text fontSize={56}>{props.pool15OnlyPointRight}</Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        <View flex={'1'} />
      </View>
    );
  }

  if (isPool15Game(props.gameSettings.category)) {
    if (props.balls.length === 0) {
      return (
        <View
          flex={'1'}
          direction={'row'}
          justify={'center'}
          alignItems={'end'}>
          <View
            style={styles.buttonWrapper}
            flex={'1'}
            direction={'row'}
            alignItems={'center'}>
            <Button
              style={[styles.button, styles.buttonRestart]}
              onPress={props.onRestart}>
              <Text color={colors.white}>{i18n.t('restart')}</Text>
            </Button>
          </View>
        </View>
      );
    }

    return (
      <ScrollView
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}>
        <View
          style={styles.ballsWrapper}
          direction={'row'}
          alignItems={'center'}
          marginRight={'15'}>
          {props.balls.map((ball, index) => {
            return (
              <View key={`ball-${index}`} marginTop={'15'}>
                <Ball data={ball} onPress={props.onSelectBall} />
              </View>
            );
          })}
        </View>
      </ScrollView>
    );
  }

  if (props.poolBreakEnabled && props.isStarted) {
    return (
      <View flex={'1'} justify={'end'} alignItems={'center'}>
        <View flex={'1'} justify={'center'}>
      {RACE_TO_GOAL}
    </View>
        
        <View style={styles.buttonWrapper} direction={'row'}>
          <Button
            style={[styles.button, styles.buttonBreakPool]}
            onPress={props.onPoolBreak}>
            <Text fontSize={16} color={colors.white} fontWeight={'bold'}>
              {i18n.t('break')}
            </Text>
          </Button>
        </View>
      </View>
    );


  }

  if(props.gameSettings.mode?.mode !== 'pro'){
    <View flex={'1'} justify={'between'} alignItems={'center'}>
    <View flex={'1'} justify={'center'}>
      {RACE_TO_GOAL}
    </View>
    </View>
  }

  if (props.gameSettings.mode?.mode === 'pro') {
    return (
      <View flex={'1'} justify={'between'} alignItems={'center'}>
        <View flex={'1'} justify={'center'}>
          {RACE_TO_GOAL}
        </View>
        <View style={styles.buttonWrapper} direction={'row'} alignItems={'end'}>
          {props.isStarted ? (
            <>
              <Button
                onPress={props.onResetTurn}
                style={[styles.button, styles.buttonResetTurn]}>
                <Text color={colors.white} fontSize={16}>
                  {i18n.t('resetTurn')}
                </Text>
              </Button>
              <Button
                onPress={props.onPressGiveMoreTime}
                style={[styles.button, styles.buttonGiveMoreTime]}>
                <Text color={colors.white} fontSize={16}>
                  {i18n.t('giveMoreTime')}
                </Text>
              </Button>
              <Button
                style={[styles.button, styles.buttonRestart]}
                onPress={props.onRestart}>
                <Text fontSize={16} color={colors.white}>
                  {i18n.t('restart')}
                </Text>
              </Button>
            </>
          ) : (
            <View
              flex={'1'}
              direction={'row'}
              justify={'center'}
              alignItems={'center'}>
              <Button
                style={[styles.button, styles.buttonSwapPlayers]}
                onPress={props.onSwapPlayers}>
                <Text>{i18n.t('switchPlayer')}</Text>
              </Button>
            </View>
          )}
        </View>
      </View>
    );
  }

  return (
    <View flex={'1'} direction={'row'} alignItems={'center'}>
      <View flex={'1'} alignItems={'center'} justify={'center'}>
        {RACE_TO_GOAL}
      </View>
    </View>
  );
};

export default memo(BallsView);
