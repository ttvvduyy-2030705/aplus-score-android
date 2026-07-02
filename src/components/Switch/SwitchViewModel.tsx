import {useCallback, useMemo, useState} from 'react';

export interface Props {
  defaultValue: boolean;
  onChange: (value: boolean) => void;
}

const SwitchViewModel = (props: Props) => {
  const [value, setValue] = useState(props.defaultValue);

  const onToggle = useCallback(
    (newValue: boolean) => {
      setValue(newValue);

      props.onChange(newValue);
    },
    [props],
  );

  return useMemo(() => {
    return {value, onToggle};
  }, [value, onToggle]);
};

export default SwitchViewModel;
