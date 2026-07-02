import React, {
  memo,
  useState,
  forwardRef,
  RefObject,
  ForwardedRef,
  useMemo,
  useCallback,
} from 'react';
import {
  TextInput as RNTextInput,
  ViewStyle,
  View,
  Image,
  TextStyle,
  KeyboardTypeOptions,
  Pressable,
} from 'react-native';
import Text from '../Text';
import images from 'assets';
import i18n from 'i18n';

import styles from './styles';
import {numberFormat} from 'utils/number';
import colors from 'configuration/colors';

interface TextInputProps {
  nextRef?: RefObject<any>;
  placeholder?: string;
  placeholderTextColor?: string;
  onChange: Function;
  containerStyle?: ViewStyle | ViewStyle[];
  style?: ViewStyle | ViewStyle[];
  cancelStyle?: ViewStyle;
  inputStyle?: TextStyle | TextStyle[];
  value: string;
  multiline?: boolean;
  notEmpty?: boolean;
  blurOnSubmit?: boolean;
  secureTextView?: boolean;
  secureTextEntry?: boolean;
  isCurrency?: boolean;
  autoFocus?: boolean;
  disabled?: boolean;
  maxLength?: number;
  keyboardType?: KeyboardTypeOptions | undefined;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  returnKeyType?:
    | 'default'
    | 'go'
    | 'google'
    | 'join'
    | 'next'
    | 'route'
    | 'search'
    | 'send'
    | 'yahoo'
    | 'done'
    | 'emergency-call';
  onSubmitEditing?: Function;
  validateValue?: (text: string) => boolean;
  onBlur?: () => void;
  onFocus?: () => void;
  errorMessage?: string;
}

const TextInput = forwardRef(
  (props: TextInputProps, ref: ForwardedRef<RNTextInput>) => {
    const {
      nextRef = null,
      placeholder,
      placeholderTextColor,
      onChange = () => {},
      containerStyle,
      style,
      inputStyle,
      value = '',
      secureTextView = false,
      multiline = false,
      notEmpty = false,
      blurOnSubmit = multiline ? false : true,
      keyboardType = 'default',
      returnKeyType = 'default',
      secureTextEntry = false,
      isCurrency = false,
      autoFocus = false,
      disabled,
      maxLength,
      cancelStyle,
      autoCapitalize,
      onSubmitEditing = () => {},
      validateValue,
      onBlur,
      onFocus,
      errorMessage,
    } = props;
    const _containerStyle = multiline
      ? styles.containerFullHeight
      : styles.container;
    const _inputStyle = multiline
      ? styles.textArea
      : secureTextView
      ? styles.input
      : styles.flexInput;

    const [secureView, setSecureView] = useState(secureTextEntry);
    const [isError, setIsError] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

    const _validate = useCallback(
      (text?: string) => {
        if (
          (notEmpty && text === '') ||
          (text && validateValue && !validateValue(text))
        ) {
          setIsError(true);
          setErrorMsg(errorMessage || i18n.t('msgNotEmpty'));
        } else if (isError) {
          setIsError(false);
        }
      },
      [isError, notEmpty, validateValue, errorMessage],
    );

    const _onChangeText = useCallback(
      (text: string) => {
        _validate(text);

        if (isCurrency) {
          onChange(numberFormat(text));
          return;
        }

        onChange(text);
      },
      [_validate, isCurrency, onChange],
    );

    const _onTouchSecureView = useCallback(() => {
      setSecureView(false);
    }, []);

    const _onReleaseTouchSecureView = useCallback(() => {
      setSecureView(true);
    }, []);

    const _onBlur = useCallback(() => {
      _validate(value);

      if (onBlur) {
        onBlur();
      }
    }, [_validate, onBlur, value]);

    const _onSubmit = useCallback(() => {
      onSubmitEditing();

      if (nextRef && !isError && (!notEmpty || (notEmpty && value !== ''))) {
        nextRef.current.focus();
      }
    }, [onSubmitEditing, nextRef, isError, notEmpty, value]);

    const buttonCancelStyle = useMemo(() => {
      if (cancelStyle) {
        return [styles.cancelInputWrapper, cancelStyle];
      }

      return styles.cancelInputWrapper;
    }, [cancelStyle]);

    return (
      <View
        style={[styles.flex, containerStyle, isError && styles.marginBottom]}>
        <View style={[_containerStyle, style]}>
          <RNTextInput
            ref={ref}
            style={[_inputStyle, inputStyle, isError && styles.error]}
            placeholder={placeholder}
            placeholderTextColor={placeholderTextColor}
            value={value}
            multiline={multiline}
            blurOnSubmit={blurOnSubmit}
            keyboardType={keyboardType}
            returnKeyType={returnKeyType}
            onChangeText={_onChangeText}
            secureTextEntry={secureView}
            autoCapitalize={autoCapitalize}
            onBlur={_onBlur}
            onFocus={onFocus}
            onSubmitEditing={_onSubmit}
            autoFocus={autoFocus}
            editable={!disabled}
            selectionColor={colors.deepGray}
            maxLength={maxLength}
          />
          {secureTextView && (
            <Pressable
              style={buttonCancelStyle}
              onPressIn={_onTouchSecureView}
              onPressOut={_onReleaseTouchSecureView}>
              <Image
                source={images.eye}
                style={styles.cancelInputIcon}
                resizeMode={'contain'}
              />
            </Pressable>
          )}
        </View>
        {isError && (
          <Text style={styles.txtError} color={colors.error} fontSize={10}>
            {errorMsg}
          </Text>
        )}
      </View>
    );
  },
);

export default memo(TextInput);
