import React, {ReactNode} from 'react';
import images from 'assets';
import i18n from 'i18n';

import Text from '../Text';
import Button from '../Button';
import Image from '../Image';
import View from '../View';

import styles from './styles';

interface Props {
  goBack: Function;
  children: ReactNode;
}

class ErrorBoundary extends React.Component<Props> {
  state: {hasError: boolean} = {
    hasError: false,
  };

  static getDerivedStateFromError() {
    // Update state so the next render will show the fallback UI.
    return {hasError: true};
  }

  componentDidCatch() {
    if (__DEV__) {
      return;
    }
  }

  goBack = () => {
    this.props.goBack();
  };

  render() {
    if (this.state.hasError) {
      return (
        <View
          flex={'1'}
          justify={'center'}
          alignItems={'center'}
          padding={'15'}>
          <Image
            source={images.offline}
            style={styles.image}
            resizeMode={'contain'}
          />

          <Text fontSize={16} textAlign={'center'} style={styles.title}>
            {i18n.t('msgUndeterminedError')}
          </Text>

          <Button
            onPress={this.goBack}
            showGradientColors
            centerChildren
            gradientStyle={styles.button}>
            <Text>{i18n.t('txtBack')}</Text>
          </Button>
        </View>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
