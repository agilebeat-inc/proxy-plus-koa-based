export type HeaderRuleCondition = {
  condition: 'header';
  headerName: string;
  includes?: string;
  equals?: string;
  matches?: string;
  flags?: string;
  exists?: boolean;
};

export type RequestHeaderRule =
  | {
      operation: 'create' | 'update';
      headerName: string;
      value: string;
      when?: HeaderRuleCondition;
    }
  | {
      operation: 'patch';
      headerName: string;
      pattern: string;
      replacement: string;
      flags?: string;
      when?: HeaderRuleCondition;
    }
  | {
      operation: 'delete';
      headerName: string;
      when?: HeaderRuleCondition;
    };

