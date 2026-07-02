import {useCallback, useEffect, useMemo, useState} from 'react';
import {
  DEFAULT_IP_CAMERA_CONFIG,
  IpCameraConfig,
  loadIpCameraConfig,
  normalizeIpCameraConfig,
  saveIpCameraConfig,
} from 'services/camera/ipCameraConfig';

const IpCameraConfigViewModel = () => {
  const [config, setConfig] = useState<IpCameraConfig>(DEFAULT_IP_CAMERA_CONFIG);
  const [savedMessageVisible, setSavedMessageVisible] = useState(false);

  useEffect(() => {
    let mounted = true;

    loadIpCameraConfig()
      .then(value => {
        if (mounted) {
          setConfig(normalizeIpCameraConfig(value));
        }
      })
      .catch(error => {
        console.log('[IPCameraConfig] load failed:', error);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const updateField = useCallback(
    (field: keyof IpCameraConfig) => (value: string | boolean) => {
      setSavedMessageVisible(false);
      setConfig(prev => normalizeIpCameraConfig({...prev, [field]: value}));
    },
    [],
  );

  const onSave = useCallback(async () => {
    const normalized = normalizeIpCameraConfig({
      ...config,
      enabled: Boolean(config.ipAddress && config.password),
      name: config.name || 'Camera IP',
    });
    const saved = await saveIpCameraConfig(normalized);
    setConfig(saved);
    setSavedMessageVisible(true);
  }, [config]);

  const onClear = useCallback(async () => {
    const saved = await saveIpCameraConfig(DEFAULT_IP_CAMERA_CONFIG);
    setConfig(saved);
    setSavedMessageVisible(false);
  }, []);

  const canSave = Boolean(config.ipAddress && config.password);

  return useMemo(
    () => ({
      config,
      savedMessageVisible,
      canSave,
      onChangeIpAddress: updateField('ipAddress'),
      onChangePassword: updateField('password'),
      onSave,
      onClear,
    }),
    [
      config,
      savedMessageVisible,
      canSave,
      updateField,
      onSave,
      onClear,
    ],
  );
};

export default IpCameraConfigViewModel;
