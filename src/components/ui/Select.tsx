'use client';

import {
  Children,
  forwardRef,
  Fragment,
  isValidElement,
  type OptionHTMLAttributes,
  type ReactElement,
  type ReactNode,
} from 'react';
import { Dropdown, type DropdownOption } from './Dropdown';

/** O que `onChange` recebe: o mesmo `event.target.value` do <select>. */
export interface SelectChangeEvent {
  target: { value: string };
  currentTarget: { value: string };
}

export interface SelectProps {
  id?: string;
  value?: string | number;
  onChange?: (event: SelectChangeEvent) => void;
  disabled?: boolean;
  invalid?: boolean;
  placeholder?: string;
  className?: string;
  children?: ReactNode;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
}

/** Texto de uma <option>, mesmo quando montado em pedacos: `{nome} ({n})`. */
function textoDe(node: ReactNode): string {
  return Children.toArray(node)
    .map((pedaco) => {
      if (typeof pedaco === 'string' || typeof pedaco === 'number') return String(pedaco);
      if (isValidElement<{ children?: ReactNode }>(pedaco)) return textoDe(pedaco.props.children);
      return '';
    })
    .join('');
}

/** As <option> escritas dentro do Select, na ordem, atravessando fragmentos. */
function lerOpcoes(children: ReactNode): DropdownOption[] {
  const opcoes: DropdownOption[] = [];
  Children.forEach(children, (filho) => {
    if (!isValidElement(filho)) return;
    const elemento = filho as ReactElement<OptionHTMLAttributes<HTMLOptionElement> & { children?: ReactNode }>;
    if (elemento.type === Fragment || elemento.type === 'optgroup') {
      opcoes.push(...lerOpcoes(elemento.props.children));
      return;
    }
    if (elemento.type !== 'option') return;
    const label = textoDe(elemento.props.children);
    opcoes.push({
      value: String(elemento.props.value ?? label),
      label,
      disabled: elemento.props.disabled,
    });
  });
  return opcoes;
}

/**
 * Lista de escolha do sistema, escrita como um <select> comum — com
 * <option> dentro e `event.target.value` no `onChange` — e desenhada como a
 * lista suspensa do sistema (`Dropdown`): caixa arredondada, busca quando a
 * lista e longa, escolha atual em azul.
 */
export const Select = forwardRef<HTMLButtonElement, SelectProps>(function Select(
  { value, onChange, children, ...props },
  ref,
) {
  const valor = value === undefined ? '' : String(value);
  return (
    <Dropdown
      ref={ref}
      {...props}
      value={valor}
      options={lerOpcoes(children)}
      onChange={(novo) => onChange?.({ target: { value: novo }, currentTarget: { value: novo } })}
    />
  );
});
