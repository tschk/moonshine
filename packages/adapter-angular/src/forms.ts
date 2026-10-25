/**
 * Host-free Angular Reactive Forms (`FormControl`, `FormGroup`, `FormArray`, `FormRecord`,
 * `FormBuilder`, `NonNullableFormBuilder`, `Validators`, and `ControlEvent` streams)
 * backed by the Moonshine signal graph.
 */
import { batch, untrack } from "@tschk/moonshine";
import {
  computed,
  InjectionToken,
  type EnvironmentProviders,
  type InteropObservable,
  makeEnvironmentProviders,
  type Observer,
  OutputEmitterRef,
  type Provider,
  signal,
  type Signal,
  type Subscribable,
  type Unsubscribable,
  type WritableSignal,
} from "./signals";

const ObservableSymbol: symbol =
  (typeof Symbol === "function" &&
    (Symbol as { observable?: symbol }).observable) ||
  Symbol.for("observable");

export type FormControlStatus = "VALID" | "INVALID" | "PENDING" | "DISABLED";

export type ValidationErrors = {
  [key: string]: any;
};

export interface ValidatorFn {
  (control: AbstractControl<any, any>): ValidationErrors | null;
}

export interface AsyncValidatorFn {
  (
    control: AbstractControl<any, any>,
  ): Promise<ValidationErrors | null> | Subscribable<ValidationErrors | null>;
}

export interface AbstractControlOptions {
  validators?: ValidatorFn | ValidatorFn[] | null;
  asyncValidators?: AsyncValidatorFn | AsyncValidatorFn[] | null;
  updateOn?: "change" | "blur" | "submit";
}

export interface FormControlOptions extends AbstractControlOptions {
  nonNullable?: boolean;
  initialValueIsDefault?: boolean;
}

export interface FormControlState<T> {
  value: T;
  disabled: boolean;
}

/**
 * Base class for events emitted by `AbstractControl.events`.
 */
export abstract class ControlEvent<_T = any> {
  abstract readonly source: AbstractControl<any>;
}

export class ValueChangeEvent<T = any> extends ControlEvent<T> {
  constructor(
    public readonly value: T,
    public readonly source: AbstractControl<any>,
  ) {
    super();
  }
}

export class StatusChangeEvent extends ControlEvent<FormControlStatus> {
  constructor(
    public readonly status: FormControlStatus,
    public readonly source: AbstractControl<any>,
  ) {
    super();
  }
}

export class PristineChangeEvent extends ControlEvent<boolean> {
  constructor(
    public readonly pristine: boolean,
    public readonly source: AbstractControl<any>,
  ) {
    super();
  }
}

export class TouchedChangeEvent extends ControlEvent<boolean> {
  constructor(
    public readonly touched: boolean,
    public readonly source: AbstractControl<any>,
  ) {
    super();
  }
}

export class FormResetEvent extends ControlEvent<void> {
  constructor(public readonly source: AbstractControl<any>) {
    super();
  }
}

export class FormSubmittedEvent extends ControlEvent<void> {
  constructor(public readonly source: AbstractControl<any>) {
    super();
  }
}

class SubjectStream<T> implements InteropObservable<T> {
  readonly #listeners = new Set<Observer<T>>();

  constructor() {
    (this as unknown as Record<PropertyKey, unknown>)[ObservableSymbol] = () =>
      this;
    (this as unknown as Record<PropertyKey, unknown>)["@@observable"] = () =>
      this;
  }

  emit(value: T): void {
    for (const observer of Array.from(this.#listeners)) {
      untrack(() => observer.next?.(value));
    }
  }

  subscribe(
    observerOrNext?: Partial<Observer<T>> | ((value: T) => void),
    error?: (err: unknown) => void,
    complete?: () => void,
  ): Unsubscribable {
    const observer: Observer<T> =
      typeof observerOrNext === "function"
        ? { next: observerOrNext, error, complete }
        : {
            next: observerOrNext?.next?.bind(observerOrNext),
            error: (observerOrNext?.error ?? error)?.bind(observerOrNext),
            complete: (observerOrNext?.complete ?? complete)?.bind(
              observerOrNext,
            ),
          };
    this.#listeners.add(observer);
    return {
      unsubscribe: () => {
        this.#listeners.delete(observer);
      },
    };
  }
}

function isEmptyInputValue(value: any): boolean {
  return (
    value == null ||
    ((typeof value === "string" || Array.isArray(value)) && value.length === 0)
  );
}

function hasValidLength(value: any): boolean {
  return (
    value != null && typeof (value as { length?: unknown }).length === "number"
  );
}

const EMAIL_REGEXP =
  /^(?=.{1,254}$)(?=.{1,64}@)[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+)*@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

function toPromise<T>(value: Promise<T> | Subscribable<T>): Promise<T> {
  if (value && typeof (value as Promise<T>).then === "function") {
    return value as Promise<T>;
  }
  if (value && typeof (value as Subscribable<T>).subscribe === "function") {
    return new Promise<T>((resolve, reject) => {
      let settled = false;
      let latest: T;
      let hasLatest = false;
      const finish = (cleanup: unknown) => {
        if (typeof cleanup === "function") cleanup();
        else if (
          cleanup &&
          typeof (cleanup as Unsubscribable).unsubscribe === "function"
        ) {
          (cleanup as Unsubscribable).unsubscribe();
        }
      };
      const sub = (value as Subscribable<T>).subscribe({
        next(v) {
          latest = v;
          hasLatest = true;
          if (!settled) {
            settled = true;
            queueMicrotask(() => finish(sub));
            resolve(v);
          }
        },
        error(err) {
          if (!settled) {
            settled = true;
            reject(err);
          }
        },
        complete() {
          if (!settled) {
            settled = true;
            resolve(hasLatest ? latest : (null as unknown as T));
          }
        },
      });
    });
  }
  return Promise.resolve(value as unknown as T);
}

function mergeErrors(
  arrayOfErrors: Array<ValidationErrors | null | undefined>,
): ValidationErrors | null {
  let res: ValidationErrors = {};
  let hasErrors = false;
  for (const errors of arrayOfErrors) {
    if (errors != null) {
      res = { ...res, ...errors };
      hasErrors = true;
    }
  }
  return hasErrors ? res : null;
}

/**
 * Standard synchronous and asynchronous form validators matching `@angular/forms`'s `Validators`.
 */
// oxlint-disable-next-line no-extraneous-class -- Matches Angular's static Validators class API.
export class Validators {
  static min(min: number): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      if (isEmptyInputValue(control.value) || isEmptyInputValue(min)) {
        return null;
      }
      const value = parseFloat(control.value);
      return !isNaN(value) && value < min
        ? { min: { min, actual: control.value } }
        : null;
    };
  }

  static max(max: number): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      if (isEmptyInputValue(control.value) || isEmptyInputValue(max)) {
        return null;
      }
      const value = parseFloat(control.value);
      return !isNaN(value) && value > max
        ? { max: { max, actual: control.value } }
        : null;
    };
  }

  static required(control: AbstractControl): ValidationErrors | null {
    return isEmptyInputValue(control.value) ? { required: true } : null;
  }

  static requiredTrue(control: AbstractControl): ValidationErrors | null {
    return control.value === true ? null : { required: true };
  }

  static email(control: AbstractControl): ValidationErrors | null {
    if (isEmptyInputValue(control.value)) {
      return null;
    }
    return EMAIL_REGEXP.test(String(control.value)) ? null : { email: true };
  }

  static minLength(minLength: number): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      if (isEmptyInputValue(control.value) || !hasValidLength(control.value)) {
        return null;
      }
      return control.value.length < minLength
        ? {
            minlength: {
              requiredLength: minLength,
              actualLength: control.value.length,
            },
          }
        : null;
    };
  }

  static maxLength(maxLength: number): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      return hasValidLength(control.value) && control.value.length > maxLength
        ? {
            maxlength: {
              requiredLength: maxLength,
              actualLength: control.value.length,
            },
          }
        : null;
    };
  }

  static pattern(pattern: string | RegExp): ValidatorFn {
    if (!pattern) return Validators.nullValidator;
    let regex: RegExp;
    let regexStr: string;
    if (typeof pattern === "string") {
      regexStr = "";
      if (pattern.charAt(0) !== "^") regexStr += "^";
      regexStr += pattern;
      if (pattern.charAt(pattern.length - 1) !== "$") regexStr += "$";
      regex = new RegExp(regexStr);
    } else {
      regexStr = pattern.toString();
      regex = pattern;
    }
    return (control: AbstractControl): ValidationErrors | null => {
      if (isEmptyInputValue(control.value)) {
        return null;
      }
      const value = String(control.value);
      return regex.test(value)
        ? null
        : { pattern: { requiredPattern: regexStr, actualValue: value } };
    };
  }

  static nullValidator(_control: AbstractControl): ValidationErrors | null {
    return null;
  }

  static compose(
    validators: (ValidatorFn | null | undefined)[] | null,
  ): ValidatorFn | null {
    if (!validators) return null;
    const presentValidators = validators.filter(
      (v): v is ValidatorFn => typeof v === "function",
    );
    if (presentValidators.length === 0) return null;
    if (presentValidators.length === 1) return presentValidators[0]!;
    return (control: AbstractControl) =>
      mergeErrors(presentValidators.map((v) => v(control)));
  }

  static composeAsync(
    validators: (AsyncValidatorFn | null | undefined)[] | null,
  ): AsyncValidatorFn | null {
    if (!validators) return null;
    const presentValidators = validators.filter(
      (v): v is AsyncValidatorFn => typeof v === "function",
    );
    if (presentValidators.length === 0) return null;
    if (presentValidators.length === 1) return presentValidators[0]!;
    return (control: AbstractControl) =>
      Promise.all(presentValidators.map((v) => toPromise(v(control)))).then(
        mergeErrors,
      );
  }
}

function isOptionsObject(
  validatorOrOpts?: ValidatorFn | ValidatorFn[] | AbstractControlOptions | null,
): validatorOrOpts is AbstractControlOptions {
  return (
    validatorOrOpts != null &&
    typeof validatorOrOpts === "object" &&
    !Array.isArray(validatorOrOpts)
  );
}

function normalizeValidators<T extends Function>(
  validators?: T | T[] | null,
): T[] {
  if (!validators) return [];
  return Array.isArray(validators)
    ? validators.filter((v): v is T => typeof v === "function")
    : typeof validators === "function"
      ? [validators]
      : [];
}

/**
 * Shared base class for `FormControl`, `FormGroup`, `FormArray`, and `FormRecord`.
 */
export abstract class AbstractControl<TValue = any, TRawValue = TValue> {
  protected readonly _valueSignal: WritableSignal<TValue>;
  protected readonly _statusSignal: WritableSignal<FormControlStatus>;
  protected readonly _errorsSignal: WritableSignal<ValidationErrors | null>;
  protected readonly _pristineSignal: WritableSignal<boolean>;
  protected readonly _touchedSignal: WritableSignal<boolean>;
  protected readonly _validSignal: Signal<boolean>;
  protected _parent: FormGroup<any> | FormArray<any> | null = null;
  protected _validators: ValidatorFn[] = [];
  protected _asyncValidators: AsyncValidatorFn[] = [];
  protected _updateOn?: "change" | "blur" | "submit";
  protected _asyncRunId = 0;

  readonly #valueChanges = new SubjectStream<TValue>();
  readonly #statusChanges = new SubjectStream<FormControlStatus>();
  readonly #events = new SubjectStream<ControlEvent<TValue>>();

  readonly valueChanges: InteropObservable<TValue> = this.#valueChanges;
  readonly statusChanges: InteropObservable<FormControlStatus> =
    this.#statusChanges;
  readonly events: InteropObservable<ControlEvent<TValue>> = this.#events;

  constructor(
    initialValue: TValue,
    validators?: ValidatorFn | ValidatorFn[] | AbstractControlOptions | null,
    asyncValidators?: AsyncValidatorFn | AsyncValidatorFn[] | null,
  ) {
    this._valueSignal = signal<TValue>(initialValue);
    this._statusSignal = signal<FormControlStatus>("VALID");
    this._errorsSignal = signal<ValidationErrors | null>(null);
    this._pristineSignal = signal<boolean>(true);
    this._touchedSignal = signal<boolean>(false);
    this._validSignal = computed(() => this._statusSignal() === "VALID");

    if (isOptionsObject(validators)) {
      this._validators = normalizeValidators(validators.validators);
      this._asyncValidators = normalizeValidators(validators.asyncValidators);
      this._updateOn = validators.updateOn;
    } else {
      this._validators = normalizeValidators(validators);
      this._asyncValidators = normalizeValidators(asyncValidators);
    }
  }

  /** Signal reading the control's current value. */
  get valueSignal(): Signal<TValue> {
    return this._valueSignal.asReadonly();
  }

  /** Signal reading the control's current validation status. */
  get statusSignal(): Signal<FormControlStatus> {
    return this._statusSignal.asReadonly();
  }

  /** Signal reading whether the control's status is `"VALID"`. */
  get validSignal(): Signal<boolean> {
    return this._validSignal;
  }

  /** Signal reading the control's current validation errors. */
  get errorsSignal(): Signal<ValidationErrors | null> {
    return this._errorsSignal.asReadonly();
  }

  /** Signal reading whether the control is pristine. */
  get pristineSignal(): Signal<boolean> {
    return this._pristineSignal.asReadonly();
  }

  /** Signal reading whether the control has been touched. */
  get touchedSignal(): Signal<boolean> {
    return this._touchedSignal.asReadonly();
  }

  get value(): TValue {
    return this._valueSignal();
  }

  get status(): FormControlStatus {
    return this._statusSignal();
  }

  get valid(): boolean {
    return this._statusSignal() === "VALID";
  }

  get invalid(): boolean {
    return this._statusSignal() === "INVALID";
  }

  get pending(): boolean {
    return this._statusSignal() === "PENDING";
  }

  get disabled(): boolean {
    return this._statusSignal() === "DISABLED";
  }

  get enabled(): boolean {
    return this._statusSignal() !== "DISABLED";
  }

  get errors(): ValidationErrors | null {
    return this._errorsSignal();
  }

  get pristine(): boolean {
    return this._pristineSignal();
  }

  get dirty(): boolean {
    return !this._pristineSignal();
  }

  get touched(): boolean {
    return this._touchedSignal();
  }

  get untouched(): boolean {
    return !this._touchedSignal();
  }

  get parent(): FormGroup<any> | FormArray<any> | null {
    return this._parent;
  }

  get root(): AbstractControl {
    if (!this._parent) return this;
    let curr: AbstractControl = this._parent;
    while (curr._parent) {
      curr = curr._parent;
    }
    return curr;
  }

  get updateOn(): "change" | "blur" | "submit" {
    return this._updateOn ?? (this._parent ? this._parent.updateOn : "change");
  }

  get validator(): ValidatorFn | null {
    return Validators.compose(this._validators);
  }

  set validator(validatorFn: ValidatorFn | null) {
    this._validators = validatorFn ? [validatorFn] : [];
  }

  get asyncValidator(): AsyncValidatorFn | null {
    return Validators.composeAsync(this._asyncValidators);
  }

  set asyncValidator(asyncValidatorFn: AsyncValidatorFn | null) {
    this._asyncValidators = asyncValidatorFn ? [asyncValidatorFn] : [];
  }

  /** @internal */
  _setParent(parent: FormGroup<any> | FormArray<any> | null): void {
    this._parent = parent;
  }

  /** @internal */
  protected _emitValueEvent(value: TValue): void {
    this.#valueChanges.emit(value);
    this.#events.emit(new ValueChangeEvent(value, this));
  }

  /** @internal */
  protected _emitStatusEvent(status: FormControlStatus): void {
    this.#statusChanges.emit(status);
    this.#events.emit(new StatusChangeEvent(status, this));
  }

  /** @internal */
  protected _emitControlEvent(event: ControlEvent<any>): void {
    this.#events.emit(event);
  }

  setValidators(validators: ValidatorFn | ValidatorFn[] | null): void {
    this._validators = normalizeValidators(validators);
  }

  setAsyncValidators(
    validators: AsyncValidatorFn | AsyncValidatorFn[] | null,
  ): void {
    this._asyncValidators = normalizeValidators(validators);
  }

  addValidators(validators: ValidatorFn | ValidatorFn[]): void {
    for (const v of normalizeValidators(validators)) {
      if (!this._validators.includes(v)) {
        this._validators.push(v);
      }
    }
  }

  addAsyncValidators(validators: AsyncValidatorFn | AsyncValidatorFn[]): void {
    for (const v of normalizeValidators(validators)) {
      if (!this._asyncValidators.includes(v)) {
        this._asyncValidators.push(v);
      }
    }
  }

  removeValidators(validators: ValidatorFn | ValidatorFn[]): void {
    const toRemove = new Set(normalizeValidators(validators));
    this._validators = this._validators.filter((v) => !toRemove.has(v));
  }

  removeAsyncValidators(
    validators: AsyncValidatorFn | AsyncValidatorFn[],
  ): void {
    const toRemove = new Set(normalizeValidators(validators));
    this._asyncValidators = this._asyncValidators.filter(
      (v) => !toRemove.has(v),
    );
  }

  hasValidator(validator: ValidatorFn): boolean {
    return this._validators.includes(validator);
  }

  hasAsyncValidator(validator: AsyncValidatorFn): boolean {
    return this._asyncValidators.includes(validator);
  }

  clearValidators(): void {
    this._validators = [];
  }

  clearAsyncValidators(): void {
    this._asyncValidators = [];
  }

  markAsTouched(opts: { onlySelf?: boolean; emitEvent?: boolean } = {}): void {
    const changed = !untrack(() => this._touchedSignal());
    this._touchedSignal.set(true);
    if (changed && opts.emitEvent !== false) {
      this._emitControlEvent(new TouchedChangeEvent(true, this));
    }
    if (this._parent && !opts.onlySelf) {
      this._parent.markAsTouched(opts);
    }
  }

  markAllAsTouched(opts: { emitEvent?: boolean } = {}): void {
    this.markAsTouched({ onlySelf: true, emitEvent: opts.emitEvent });
    this._forEachChild((control) => control.markAllAsTouched(opts));
  }

  markAsUntouched(
    opts: { onlySelf?: boolean; emitEvent?: boolean } = {},
  ): void {
    const changed = untrack(() => this._touchedSignal());
    this._touchedSignal.set(false);
    this._forEachChild((control) => {
      control.markAsUntouched({ onlySelf: true, emitEvent: opts.emitEvent });
    });
    if (changed && opts.emitEvent !== false) {
      this._emitControlEvent(new TouchedChangeEvent(false, this));
    }
    if (this._parent && !opts.onlySelf) {
      this._parent._updateTouched(opts);
    }
  }

  markAsDirty(opts: { onlySelf?: boolean; emitEvent?: boolean } = {}): void {
    const changed = untrack(() => this._pristineSignal());
    this._pristineSignal.set(false);
    if (changed && opts.emitEvent !== false) {
      this._emitControlEvent(new PristineChangeEvent(false, this));
    }
    if (this._parent && !opts.onlySelf) {
      this._parent.markAsDirty(opts);
    }
  }

  markAsPristine(opts: { onlySelf?: boolean; emitEvent?: boolean } = {}): void {
    const changed = !untrack(() => this._pristineSignal());
    this._pristineSignal.set(true);
    this._forEachChild((control) => {
      control.markAsPristine({ onlySelf: true, emitEvent: opts.emitEvent });
    });
    if (changed && opts.emitEvent !== false) {
      this._emitControlEvent(new PristineChangeEvent(true, this));
    }
    if (this._parent && !opts.onlySelf) {
      this._parent._updatePristine(opts);
    }
  }

  markAsPending(opts: { onlySelf?: boolean; emitEvent?: boolean } = {}): void {
    this._statusSignal.set("PENDING");
    if (opts.emitEvent !== false) {
      this._emitStatusEvent("PENDING");
    }
    if (this._parent && !opts.onlySelf) {
      this._parent.markAsPending(opts);
    }
  }

  markAsSubmitted(opts: { emitEvent?: boolean } = {}): void {
    if (opts.emitEvent !== false) {
      this._emitControlEvent(new FormSubmittedEvent(this));
    }
  }

  disable(opts: { onlySelf?: boolean; emitEvent?: boolean } = {}): void {
    this._asyncRunId++;
    batch(() => {
      this._statusSignal.set("DISABLED");
      this._errorsSignal.set(null);
      this._forEachChild((control) => {
        control.disable({ onlySelf: true, emitEvent: false });
      });
      this._updateValue();
    });
    if (opts.emitEvent !== false) {
      this._emitValueEvent(untrack(() => this._valueSignal()));
      this._emitStatusEvent("DISABLED");
    }
    this._updateAncestors(opts);
  }

  enable(opts: { onlySelf?: boolean; emitEvent?: boolean } = {}): void {
    this._statusSignal.set("VALID");
    this._forEachChild((control) => {
      control.enable({ onlySelf: true, emitEvent: false });
    });
    this.updateValueAndValidity({ onlySelf: true, emitEvent: opts.emitEvent });
    this._updateAncestors(opts);
  }

  protected _updateAncestors(opts: {
    onlySelf?: boolean;
    emitEvent?: boolean;
  }): void {
    if (this._parent && !opts.onlySelf) {
      this._parent.updateValueAndValidity(opts);
      this._parent._updatePristine({});
      this._parent._updateTouched({});
    }
  }

  updateValueAndValidity(
    opts: { onlySelf?: boolean; emitEvent?: boolean } = {},
  ): void {
    this._setInitialStatus();
    this._updateValue();

    if (untrack(() => this._statusSignal()) !== "DISABLED") {
      this._asyncRunId++;
      const errors = this._runValidator();
      this._errorsSignal.set(errors);
      const status = this._calculateStatus();
      this._statusSignal.set(status);
      if (
        (status === "VALID" || status === "PENDING") &&
        this._asyncValidators.length > 0
      ) {
        this._runAsyncValidator(opts.emitEvent);
      }
    }

    if (opts.emitEvent !== false) {
      this._emitValueEvent(untrack(() => this._valueSignal()));
      this._emitStatusEvent(untrack(() => this._statusSignal()));
    }

    if (this._parent && !opts.onlySelf) {
      this._parent.updateValueAndValidity(opts);
    }
  }

  protected _runValidator(): ValidationErrors | null {
    const composed = this.validator;
    return composed ? composed(this) : null;
  }

  protected _runAsyncValidator(emitEvent?: boolean): void {
    const composed = this.asyncValidator;
    if (!composed) return;
    this._statusSignal.set("PENDING");
    const runId = ++this._asyncRunId;
    toPromise(composed(this)).then(
      (errors) => {
        if (runId !== this._asyncRunId) return;
        this.setErrors(errors, { emitEvent });
      },
      () => {
        if (runId !== this._asyncRunId) return;
        this.setErrors({ asyncValidatorError: true }, { emitEvent });
      },
    );
  }

  setErrors(
    errors: ValidationErrors | null,
    opts: { emitEvent?: boolean } = {},
  ): void {
    batch(() => {
      this._errorsSignal.set(errors);
      this._updateControlsErrors(opts.emitEvent !== false);
    });
  }

  /** @internal */
  _updateControlsErrors(emitEvent: boolean): void {
    const status = this._calculateStatus();
    this._statusSignal.set(status);
    if (emitEvent) {
      this._emitStatusEvent(status);
    }
    if (this._parent) {
      this._parent._updateControlsErrors(emitEvent);
    }
  }

  /** @internal */
  _updatePristine(opts: { onlySelf?: boolean; emitEvent?: boolean }): void {
    const nextPristine = !this._anyControlsDirty();
    const changed = untrack(() => this._pristineSignal()) !== nextPristine;
    this._pristineSignal.set(nextPristine);
    if (changed && opts.emitEvent !== false) {
      this._emitControlEvent(new PristineChangeEvent(nextPristine, this));
    }
    if (this._parent && !opts.onlySelf) {
      this._parent._updatePristine(opts);
    }
  }

  /** @internal */
  _updateTouched(opts: { onlySelf?: boolean; emitEvent?: boolean }): void {
    const nextTouched = this._anyControlsTouched();
    const changed = untrack(() => this._touchedSignal()) !== nextTouched;
    this._touchedSignal.set(nextTouched);
    if (changed && opts.emitEvent !== false) {
      this._emitControlEvent(new TouchedChangeEvent(nextTouched, this));
    }
    if (this._parent && !opts.onlySelf) {
      this._parent._updateTouched(opts);
    }
  }

  protected _calculateStatus(): FormControlStatus {
    if (this._allControlsDisabled()) return "DISABLED";
    if (untrack(() => this._errorsSignal())) return "INVALID";
    if (this._anyControlsHaveStatus("PENDING")) return "PENDING";
    if (this._anyControlsHaveStatus("INVALID")) return "INVALID";
    return "VALID";
  }

  protected _setInitialStatus(): void {
    if (this._allControlsDisabled()) {
      this._statusSignal.set("DISABLED");
    } else {
      this._statusSignal.set("VALID");
    }
  }

  get(path: Array<string | number> | string): AbstractControl | null {
    let parts: Array<string | number>;
    if (path == null) return null;
    if (Array.isArray(path)) {
      parts = path;
    } else {
      parts = path.split(".");
    }
    if (parts.length === 0) return null;
    return parts.reduce<AbstractControl | null>((curr, name) => {
      if (!curr) return null;
      if (curr instanceof FormGroup) {
        return Object.prototype.hasOwnProperty.call(curr.controls, name)
          ? (curr.controls[String(name)] ?? null)
          : null;
      }
      if (curr instanceof FormArray) {
        const idx = typeof name === "number" ? name : Number(name);
        return Number.isInteger(idx) ? (curr.at(idx) ?? null) : null;
      }
      return null;
    }, this);
  }

  getError(errorCode: string, path?: Array<string | number> | string): any {
    const control = path ? this.get(path) : this;
    return control && control.errors
      ? (control.errors[errorCode] ?? null)
      : null;
  }

  hasError(errorCode: string, path?: Array<string | number> | string): boolean {
    return !!this.getError(errorCode, path);
  }

  abstract setValue(value: TRawValue, options?: object): void;
  abstract patchValue(value: TValue, options?: object): void;
  abstract reset(value?: TValue, options?: object): void;
  abstract getRawValue(): any;

  /** @internal */
  abstract _updateValue(): void;
  /** @internal */
  abstract _forEachChild(cb: (control: AbstractControl) => void): void;
  /** @internal */
  abstract _anyControls(
    condition: (control: AbstractControl) => boolean,
  ): boolean;
  /** @internal */
  abstract _allControlsDisabled(): boolean;

  protected _anyControlsHaveStatus(status: FormControlStatus): boolean {
    return this._anyControls(
      (c) => untrack(() => c._statusSignal()) === status,
    );
  }

  protected _anyControlsDirty(): boolean {
    return this._anyControls((c) => c.dirty);
  }

  protected _anyControlsTouched(): boolean {
    return this._anyControls((c) => c.touched);
  }
}

function isFormControlState<T>(
  formState: unknown,
): formState is FormControlState<T> {
  return (
    typeof formState === "object" &&
    formState !== null &&
    Object.keys(formState).length === 2 &&
    "value" in formState &&
    "disabled" in formState
  );
}

/**
 * Tracks the value and validation status of an individual form control.
 */
export class FormControl<TValue = any> extends AbstractControl<TValue, TValue> {
  readonly defaultValue: TValue;
  #pendingDisabledInit = false;

  constructor(
    value: FormControlState<TValue> | TValue = null as unknown as TValue,
    validatorOrOpts?: ValidatorFn | ValidatorFn[] | FormControlOptions | null,
    asyncValidator?: AsyncValidatorFn | AsyncValidatorFn[] | null,
  ) {
    const initialValue = isFormControlState<TValue>(value)
      ? value.value
      : value;
    super(initialValue, validatorOrOpts, asyncValidator);

    const useInitialAsDefault =
      isOptionsObject(validatorOrOpts) &&
      Boolean(
        (validatorOrOpts as FormControlOptions).nonNullable ||
        (validatorOrOpts as FormControlOptions).initialValueIsDefault,
      );
    this.defaultValue = useInitialAsDefault
      ? initialValue
      : (null as unknown as TValue);

    if (isFormControlState<TValue>(value) && value.disabled) {
      this.#pendingDisabledInit = true;
    }
    this.#initControl();
  }

  #initControl(): void {
    if (this.#pendingDisabledInit) {
      this._statusSignal.set("DISABLED");
      this._errorsSignal.set(null);
    } else {
      this.updateValueAndValidity({ onlySelf: true, emitEvent: false });
    }
  }

  override setValue(
    value: TValue,
    options: {
      onlySelf?: boolean;
      emitEvent?: boolean;
      emitModelToViewChange?: boolean;
      emitViewToModelChange?: boolean;
    } = {},
  ): void {
    this._valueSignal.set(value);
    this.updateValueAndValidity(options);
  }

  override patchValue(
    value: TValue,
    options: {
      onlySelf?: boolean;
      emitEvent?: boolean;
      emitModelToViewChange?: boolean;
      emitViewToModelChange?: boolean;
    } = {},
  ): void {
    this.setValue(value, options);
  }

  override reset(
    formState: TValue | FormControlState<TValue> = this.defaultValue,
    options: { onlySelf?: boolean; emitEvent?: boolean } = {},
  ): void {
    this.#applyFormState(formState);
    this.markAsPristine(options);
    this.markAsUntouched(options);
    this.setValue(
      untrack(() => this._valueSignal()),
      options,
    );
    if (options.emitEvent !== false) {
      this._emitControlEvent(new FormResetEvent(this));
    }
  }

  #applyFormState(formState: TValue | FormControlState<TValue>): void {
    if (isFormControlState<TValue>(formState)) {
      this._valueSignal.set(formState.value);
      if (formState.disabled) {
        this.disable({ onlySelf: true, emitEvent: false });
      } else {
        this.enable({ onlySelf: true, emitEvent: false });
      }
    } else {
      this._valueSignal.set(formState);
    }
  }

  override getRawValue(): TValue {
    return this._valueSignal();
  }

  /** @internal */
  override _updateValue(): void {}

  /** @internal */
  override _forEachChild(_cb: (control: AbstractControl) => void): void {}

  /** @internal */
  override _anyControls(
    _condition: (control: AbstractControl) => boolean,
  ): boolean {
    return false;
  }

  /** @internal */
  override _allControlsDisabled(): boolean {
    return untrack(() => this._statusSignal()) === "DISABLED";
  }
}

export type FormGroupValue<
  T extends { [K in keyof T]?: AbstractControl<any> },
> = {
  [K in keyof T]: T[K] extends AbstractControl<infer V, any> ? V : never;
};

export type FormGroupRawValue<
  T extends { [K in keyof T]?: AbstractControl<any> },
> = {
  [K in keyof T]: T[K] extends AbstractControl<any, infer R> ? R : never;
};

/**
 * Tracks the value and validity state of a group of `AbstractControl` instances.
 */
export class FormGroup<
  TControl extends { [K in keyof TControl]: AbstractControl<any> } = any,
> extends AbstractControl<
  Partial<FormGroupValue<TControl>>,
  FormGroupRawValue<TControl>
> {
  readonly controls: TControl;

  constructor(
    controls: TControl,
    validatorOrOpts?:
      ValidatorFn | ValidatorFn[] | AbstractControlOptions | null,
    asyncValidator?: AsyncValidatorFn | AsyncValidatorFn[] | null,
  ) {
    super(
      {} as Partial<FormGroupValue<TControl>>,
      validatorOrOpts,
      asyncValidator,
    );
    this.controls = controls;
    this.#setUpControls();
    this.updateValueAndValidity({ onlySelf: true, emitEvent: false });
  }

  #setUpControls(): void {
    this._forEachChild((control) => {
      control._setParent(this);
    });
  }

  registerControl<K extends string & keyof TControl>(
    name: K,
    control: TControl[K],
  ): TControl[K];
  registerControl(name: string, control: AbstractControl): AbstractControl;
  registerControl(name: string, control: AbstractControl): AbstractControl {
    const existing = (this.controls as Record<string, AbstractControl>)[name];
    if (existing) return existing;
    (this.controls as Record<string, AbstractControl>)[name] = control;
    control._setParent(this);
    return control;
  }

  addControl<K extends string & keyof TControl>(
    name: K,
    control: TControl[K],
    options?: { emitEvent?: boolean },
  ): void;
  addControl(
    name: string,
    control: AbstractControl,
    options?: { emitEvent?: boolean },
  ): void;
  addControl(
    name: string,
    control: AbstractControl,
    options: { emitEvent?: boolean } = {},
  ): void {
    this.registerControl(name, control);
    this.updateValueAndValidity({ emitEvent: options.emitEvent });
  }

  removeControl(name: string, options: { emitEvent?: boolean } = {}): void {
    const existing = (this.controls as Record<string, AbstractControl>)[name];
    if (existing) {
      existing._setParent(null);
    }
    delete (this.controls as Record<string, AbstractControl>)[name];
    this.updateValueAndValidity({ emitEvent: options.emitEvent });
  }

  setControl<K extends string & keyof TControl>(
    name: K,
    control: TControl[K],
    options?: { emitEvent?: boolean },
  ): void;
  setControl(
    name: string,
    control: AbstractControl,
    options?: { emitEvent?: boolean },
  ): void;
  setControl(
    name: string,
    control: AbstractControl,
    options: { emitEvent?: boolean } = {},
  ): void {
    const existing = (this.controls as Record<string, AbstractControl>)[name];
    if (existing) {
      existing._setParent(null);
    }
    (this.controls as Record<string, AbstractControl>)[name] = control;
    control._setParent(this);
    this.updateValueAndValidity({ emitEvent: options.emitEvent });
  }

  contains(controlName: string): boolean {
    return (
      Object.prototype.hasOwnProperty.call(this.controls, controlName) &&
      (this.controls as Record<string, AbstractControl>)[controlName]!.enabled
    );
  }

  override setValue(
    value: FormGroupRawValue<TControl>,
    options: { onlySelf?: boolean; emitEvent?: boolean } = {},
  ): void {
    this.#checkAllValuesPresent(value);
    batch(() => {
      for (const name of Object.keys(value as Record<string, unknown>)) {
        this.#throwIfControlMissing(name);
        (this.controls as Record<string, AbstractControl>)[name]!.setValue(
          (value as Record<string, unknown>)[name],
          { onlySelf: true, emitEvent: options.emitEvent },
        );
      }
      this.updateValueAndValidity(options);
    });
  }

  override patchValue(
    value: Partial<FormGroupValue<TControl>>,
    options: { onlySelf?: boolean; emitEvent?: boolean } = {},
  ): void {
    if (value == null) return;
    batch(() => {
      for (const name of Object.keys(value as Record<string, unknown>)) {
        const control = (this.controls as Record<string, AbstractControl>)[
          name
        ];
        if (control) {
          control.patchValue((value as Record<string, unknown>)[name], {
            onlySelf: true,
            emitEvent: options.emitEvent,
          });
        }
      }
      this.updateValueAndValidity(options);
    });
  }

  override reset(
    value: Partial<FormGroupValue<TControl>> = {},
    options: { onlySelf?: boolean; emitEvent?: boolean } = {},
  ): void {
    batch(() => {
      this._forEachChild((control, name) => {
        control.reset(
          value ? (value as Record<string, unknown>)[name] : undefined,
          { onlySelf: true, emitEvent: options.emitEvent },
        );
      });
      this._updatePristine(options);
      this._updateTouched(options);
      this.updateValueAndValidity(options);
    });
    if (options.emitEvent !== false) {
      this._emitControlEvent(new FormResetEvent(this));
    }
  }

  override getRawValue(): FormGroupRawValue<TControl> {
    const res: Record<string, any> = {};
    this._forEachChild((control, name) => {
      res[name] = control.getRawValue();
    });
    return res as FormGroupRawValue<TControl>;
  }

  #checkAllValuesPresent(value: any): void {
    this._forEachChild((_control, name) => {
      if (value == null || !(name in value)) {
        throw new Error(
          `Must supply a value for form control with name: '${name}'.`,
        );
      }
    });
  }

  #throwIfControlMissing(name: string): void {
    if (!Object.keys(this.controls).length) {
      throw new Error(
        `There are no form controls registered with this group yet.`,
      );
    }
    if (!(name in this.controls)) {
      throw new Error(`Cannot find form control with name: ${name}.`);
    }
  }

  /** @internal */
  override _updateValue(): void {
    const next: Record<string, any> = {};
    let anyEnabled = false;
    this._forEachChild((control, name) => {
      if (control.enabled) {
        anyEnabled = true;
        next[name] = control.value;
      }
    });
    if (!anyEnabled && untrack(() => this._statusSignal()) === "DISABLED") {
      this._forEachChild((control, name) => {
        next[name] = control.value;
      });
    }
    this._valueSignal.set(next as Partial<FormGroupValue<TControl>>);
  }

  /** @internal */
  override _forEachChild(
    cb: (control: AbstractControl, name: string) => void,
  ): void {
    for (const [name, control] of Object.entries(
      this.controls as Record<string, AbstractControl>,
    )) {
      if (control) cb(control, name);
    }
  }

  /** @internal */
  override _anyControls(
    condition: (control: AbstractControl) => boolean,
  ): boolean {
    for (const [name, control] of Object.entries(
      this.controls as Record<string, AbstractControl>,
    )) {
      if (this.contains(name) && condition(control)) {
        return true;
      }
    }
    return false;
  }

  /** @internal */
  override _allControlsDisabled(): boolean {
    const keys = Object.keys(this.controls);
    if (keys.length === 0) {
      return untrack(() => this._statusSignal()) === "DISABLED";
    }
    for (const name of keys) {
      if ((this.controls as Record<string, AbstractControl>)[name]!.enabled) {
        return false;
      }
    }
    return true;
  }
}

/**
 * Dynamic string-keyed `FormGroup` where controls of a uniform type can be added and removed.
 */
export class FormRecord<
  TControl extends AbstractControl = AbstractControl,
> extends FormGroup<{ [key: string]: TControl }> {}

export type FormArrayValue<T extends AbstractControl<any>> =
  T extends AbstractControl<infer V, any> ? V[] : never;

export type FormArrayRawValue<T extends AbstractControl<any>> =
  T extends AbstractControl<any, infer R> ? R[] : never;

/**
 * Tracks the value and validity state of an array of `AbstractControl` instances.
 */
export class FormArray<
  TControl extends AbstractControl<any> = any,
> extends AbstractControl<
  FormArrayValue<TControl>,
  FormArrayRawValue<TControl>
> {
  readonly controls: TControl[];

  constructor(
    controls: TControl[],
    validatorOrOpts?:
      ValidatorFn | ValidatorFn[] | AbstractControlOptions | null,
    asyncValidator?: AsyncValidatorFn | AsyncValidatorFn[] | null,
  ) {
    super(
      [] as unknown as FormArrayValue<TControl>,
      validatorOrOpts,
      asyncValidator,
    );
    this.controls = [...controls];
    this.#setUpControls();
    this.updateValueAndValidity({ onlySelf: true, emitEvent: false });
  }

  #setUpControls(): void {
    this._forEachChild((control) => {
      control._setParent(this);
    });
  }

  at(index: number): TControl {
    const resolved = index < 0 ? this.controls.length + index : index;
    return this.controls[resolved]!;
  }

  push(control: TControl, options: { emitEvent?: boolean } = {}): void {
    this.controls.push(control);
    control._setParent(this);
    this.updateValueAndValidity({ emitEvent: options.emitEvent });
  }

  insert(
    index: number,
    control: TControl,
    options: { emitEvent?: boolean } = {},
  ): void {
    this.controls.splice(index, 0, control);
    control._setParent(this);
    this.updateValueAndValidity({ emitEvent: options.emitEvent });
  }

  removeAt(index: number, options: { emitEvent?: boolean } = {}): void {
    const resolved = index < 0 ? this.controls.length + index : index;
    if (resolved < 0 || resolved >= this.controls.length) return;
    const [removed] = this.controls.splice(resolved, 1);
    removed?._setParent(null);
    this.updateValueAndValidity({ emitEvent: options.emitEvent });
  }

  setControl(
    index: number,
    control: TControl,
    options: { emitEvent?: boolean } = {},
  ): void {
    const existing = this.controls[index];
    existing?._setParent(null);
    this.controls.splice(index, 1, control);
    control._setParent(this);
    this.updateValueAndValidity({ emitEvent: options.emitEvent });
  }

  get length(): number {
    return this.controls.length;
  }

  clear(options: { emitEvent?: boolean } = {}): void {
    if (this.controls.length === 0) return;
    this._forEachChild((control) => control._setParent(null));
    this.controls.splice(0);
    this.updateValueAndValidity({ emitEvent: options.emitEvent });
  }

  override setValue(
    value: FormArrayRawValue<TControl>,
    options: { onlySelf?: boolean; emitEvent?: boolean } = {},
  ): void {
    if (!Array.isArray(value) || value.length !== this.controls.length) {
      throw new Error(
        `Must supply an array of length ${this.controls.length} for FormArray.setValue().`,
      );
    }
    batch(() => {
      value.forEach((newValue, index) => {
        this.at(index).setValue(newValue, {
          onlySelf: true,
          emitEvent: options.emitEvent,
        });
      });
      this.updateValueAndValidity(options);
    });
  }

  override patchValue(
    value: Partial<FormArrayValue<TControl>>,
    options: { onlySelf?: boolean; emitEvent?: boolean } = {},
  ): void {
    if (value == null) return;
    batch(() => {
      value.forEach((newValue, index) => {
        if (this.at(index)) {
          this.at(index).patchValue(newValue, {
            onlySelf: true,
            emitEvent: options.emitEvent,
          });
        }
      });
      this.updateValueAndValidity(options);
    });
  }

  override reset(
    value: Partial<FormArrayValue<TControl>> = [] as unknown as Partial<
      FormArrayValue<TControl>
    >,
    options: { onlySelf?: boolean; emitEvent?: boolean } = {},
  ): void {
    batch(() => {
      this._forEachChild((control, index) => {
        control.reset(value[index], {
          onlySelf: true,
          emitEvent: options.emitEvent,
        });
      });
      this._updatePristine(options);
      this._updateTouched(options);
      this.updateValueAndValidity(options);
    });
    if (options.emitEvent !== false) {
      this._emitControlEvent(new FormResetEvent(this));
    }
  }

  override getRawValue(): FormArrayRawValue<TControl> {
    return this.controls.map((control) =>
      control.getRawValue(),
    ) as FormArrayRawValue<TControl>;
  }

  /** @internal */
  override _updateValue(): void {
    const next: any[] = [];
    let anyEnabled = false;
    for (const control of this.controls) {
      if (control.enabled) {
        anyEnabled = true;
        next.push(control.value);
      }
    }
    if (!anyEnabled && untrack(() => this._statusSignal()) === "DISABLED") {
      for (const control of this.controls) {
        next.push(control.value);
      }
    }
    this._valueSignal.set(next as FormArrayValue<TControl>);
  }

  /** @internal */
  override _forEachChild(
    cb: (control: AbstractControl, index: number) => void,
  ): void {
    this.controls.forEach((control, index) => {
      cb(control, index);
    });
  }

  /** @internal */
  override _anyControls(
    condition: (control: AbstractControl) => boolean,
  ): boolean {
    return this.controls.some(
      (control) => control.enabled && condition(control),
    );
  }

  /** @internal */
  override _allControlsDisabled(): boolean {
    if (this.controls.length === 0) {
      return untrack(() => this._statusSignal()) === "DISABLED";
    }
    return this.controls.every((control) => control.disabled);
  }
}

export function isFormControl(control: unknown): control is FormControl {
  return control instanceof FormControl;
}

export function isFormGroup(control: unknown): control is FormGroup {
  return control instanceof FormGroup && !(control instanceof FormRecord);
}

export function isFormRecord(control: unknown): control is FormRecord {
  return control instanceof FormRecord;
}

export function isFormArray(control: unknown): control is FormArray {
  return control instanceof FormArray;
}

export type ControlConfig<T> = [
  T | FormControlState<T>,
  (ValidatorFn | ValidatorFn[] | null)?,
  (AsyncValidatorFn | AsyncValidatorFn[] | null)?,
];

/**
 * Builder service for constructing `FormControl`, `FormGroup`, `FormRecord`, and `FormArray` instances.
 */
export class FormBuilder {
  private readonly useNonNullable: boolean;

  constructor(useNonNullable = false) {
    this.useNonNullable = useNonNullable;
  }

  get nonNullable(): NonNullableFormBuilder {
    return new NonNullableFormBuilder();
  }

  group<T extends { [key: string]: any }>(
    controls: T,
    options?: AbstractControlOptions | null,
  ): FormGroup<{
    [K in keyof T]: T[K] extends AbstractControl
      ? T[K]
      : T[K] extends ControlConfig<infer V>
        ? FormControl<V>
        : T[K] extends FormControlState<infer V>
          ? FormControl<V>
          : FormControl<T[K]>;
  }> {
    const reducedControls = this.#reduceControls(controls);
    return new FormGroup(reducedControls as any, options);
  }

  record<T>(
    controls: {
      [key: string]:
        T | ControlConfig<T> | FormControlState<T> | FormControl<T>;
    },
    options?: AbstractControlOptions | null,
  ): FormRecord<FormControl<T>> {
    const reducedControls = this.#reduceControls(controls);
    return new FormRecord(reducedControls as any, options);
  }

  control<T>(
    formState: T | FormControlState<T>,
    validatorOrOpts?: ValidatorFn | ValidatorFn[] | FormControlOptions | null,
    asyncValidator?: AsyncValidatorFn | AsyncValidatorFn[] | null,
  ): FormControl<T> {
    let newOpts: FormControlOptions = {};
    if (!this.useNonNullable) {
      return new FormControl(formState, validatorOrOpts, asyncValidator);
    }
    if (isOptionsObject(validatorOrOpts)) {
      newOpts = { ...validatorOrOpts, nonNullable: true };
    } else {
      newOpts = {
        validators: validatorOrOpts,
        asyncValidators: asyncValidator,
        nonNullable: true,
      };
    }
    return new FormControl(formState, newOpts);
  }

  array<T>(
    controls: T[],
    validatorOrOpts?:
      ValidatorFn | ValidatorFn[] | AbstractControlOptions | null,
    asyncValidator?: AsyncValidatorFn | AsyncValidatorFn[] | null,
  ): FormArray<
    T extends AbstractControl
      ? T
      : T extends ControlConfig<infer V>
        ? FormControl<V>
        : T extends FormControlState<infer V>
          ? FormControl<V>
          : FormControl<T>
  > {
    const createdControls = controls.map((c) => this.#createControl(c));
    return new FormArray(
      createdControls as any,
      validatorOrOpts,
      asyncValidator,
    );
  }

  #reduceControls<T>(controlsConfig: { [k: string]: T }): {
    [key: string]: AbstractControl;
  } {
    const controls: { [key: string]: AbstractControl } = {};
    for (const [controlName, controlConfig] of Object.entries(controlsConfig)) {
      controls[controlName] = this.#createControl(controlConfig);
    }
    return controls;
  }

  #createControl(controls: any): AbstractControl {
    if (controls instanceof AbstractControl) {
      return controls;
    } else if (Array.isArray(controls)) {
      const value = controls[0];
      const validator: ValidatorFn = controls.length > 1 ? controls[1] : null;
      const asyncValidator: AsyncValidatorFn =
        controls.length > 2 ? controls[2] : null;
      return this.control(value, validator, asyncValidator);
    } else {
      return this.control(controls);
    }
  }
}

export class NonNullableFormBuilder extends FormBuilder {
  constructor() {
    super(true);
  }
}

export const FORM_BUILDER = new InjectionToken<FormBuilder>("FORM_BUILDER", {
  factory: () => new FormBuilder(),
});

/**
 * Provides `FormBuilder` and `NonNullableFormBuilder` in an Angular `EnvironmentInjector`.
 */
export function provideForms(): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: FormBuilder, useFactory: () => new FormBuilder() },
    {
      provide: NonNullableFormBuilder,
      useFactory: () => new NonNullableFormBuilder(),
    },
  ]);
}

// ============================================================================
// Value Accessors, Directives, `FormsModule` & `ReactiveFormsModule`
// ============================================================================

export interface ControlValueAccessor {
  writeValue(obj: any): void;
  registerOnChange(fn: any): void;
  registerOnTouched(fn: any): void;
  setDisabledState?(isDisabled: boolean): void;
}

export interface Validator {
  validate(control: AbstractControl): ValidationErrors | null;
  registerOnValidatorChange?(fn: () => void): void;
}

export interface AsyncValidator {
  validate(
    control: AbstractControl,
  ): Promise<ValidationErrors | null> | Subscribable<ValidationErrors | null>;
  registerOnValidatorChange?(fn: () => void): void;
}

export const NG_VALUE_ACCESSOR = new InjectionToken<
  ReadonlyArray<ControlValueAccessor>
>("NgValueAccessor");

export const NG_VALIDATORS = new InjectionToken<
  ReadonlyArray<ValidatorFn | Validator>
>("NgValidators");

export const NG_ASYNC_VALIDATORS = new InjectionToken<
  ReadonlyArray<AsyncValidatorFn | AsyncValidator>
>("NgAsyncValidators");

export class DefaultValueAccessor implements ControlValueAccessor {
  static readonly ɵdir = {
    selector:
      "input:not([type=checkbox])[formControlName],textarea[formControlName],input:not([type=checkbox])[formControl],textarea[formControl],input:not([type=checkbox])[ngModel],textarea[ngModel]",
    standalone: true,
  };
  value: any = "";
  disabled = false;
  onChange: (value: any) => void = () => {};
  onTouched: () => void = () => {};
  writeValue(value: any): void {
    this.value = value ?? "";
  }
  registerOnChange(fn: (value: any) => void): void {
    this.onChange = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }
  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }
}

export class CheckboxControlValueAccessor implements ControlValueAccessor {
  static readonly ɵdir = {
    selector:
      "input[type=checkbox][formControlName],input[type=checkbox][formControl],input[type=checkbox][ngModel]",
    standalone: true,
  };
  checked = false;
  disabled = false;
  onChange: (value: boolean) => void = () => {};
  onTouched: () => void = () => {};
  writeValue(value: any): void {
    this.checked = Boolean(value);
  }
  registerOnChange(fn: (value: boolean) => void): void {
    this.onChange = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }
  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }
}

export class NumberValueAccessor implements ControlValueAccessor {
  static readonly ɵdir = {
    selector:
      "input[type=number][formControlName],input[type=number][formControl],input[type=number][ngModel]",
    standalone: true,
  };
  value: number | null = null;
  disabled = false;
  onChange: (value: number | null) => void = () => {};
  onTouched: () => void = () => {};
  writeValue(value: number | null): void {
    this.value = value ?? null;
  }
  registerOnChange(fn: (value: number | null) => void): void {
    this.onChange = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }
  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }
}

export class SelectControlValueAccessor implements ControlValueAccessor {
  static readonly ɵdir = {
    selector:
      "select:not([multiple])[formControlName],select:not([multiple])[formControl],select:not([multiple])[ngModel]",
    standalone: true,
  };
  value: any = "";
  disabled = false;
  onChange: (value: any) => void = () => {};
  onTouched: () => void = () => {};
  writeValue(value: any): void {
    this.value = value ?? "";
  }
  registerOnChange(fn: (value: any) => void): void {
    this.onChange = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }
  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }
}

export class FormControlDirective<T = any> {
  static readonly ɵdir = {
    selector: "[formControl]",
    standalone: true,
    inputs: ["formControl", "disabled"],
    exportAs: ["ngForm"],
  };
  form: FormControl<T>;
  constructor(form: FormControl<T> = new FormControl<any>(null)) {
    this.form = form;
  }
  get control(): FormControl<T> {
    return this.form;
  }
  get value(): T {
    return this.form.value;
  }
  get valid(): boolean {
    return this.form.valid;
  }
  get invalid(): boolean {
    return this.form.invalid;
  }
  viewToModelUpdate(newValue: T): void {
    this.form.setValue(newValue);
    this.form.markAsDirty();
  }
}

export class FormControlName {
  static readonly ɵdir = {
    selector: "[formControlName]",
    standalone: true,
    inputs: ["formControlName", "disabled"],
  };
  name: string | number | null = null;
  control: FormControl<any> = new FormControl<any>(null);
}

export class FormGroupDirective {
  static readonly ɵdir = {
    selector: "[formGroup]",
    standalone: true,
    inputs: ["formGroup"],
    outputs: ["ngSubmit"],
    exportAs: ["ngForm"],
  };
  form: FormGroup<any>;
  submitted = false;
  readonly ngSubmit = new OutputEmitterRef<Event | undefined>();

  constructor(form: FormGroup<any> = new FormGroup({})) {
    this.form = form;
  }

  get control(): FormGroup<any> {
    return this.form;
  }

  onSubmit($event?: Event): boolean {
    this.submitted = true;
    this.form.markAsSubmitted();
    this.ngSubmit.emit($event);
    return false;
  }

  resetForm(value?: any): void {
    this.submitted = false;
    this.form.reset(value);
  }
}

export class FormGroupName {
  static readonly ɵdir = {
    selector: "[formGroupName]",
    standalone: true,
    inputs: ["formGroupName"],
  };
  name: string | number | null = null;
  control: FormGroup<any> = new FormGroup({});
}

export class FormArrayName {
  static readonly ɵdir = {
    selector: "[formArrayName]",
    standalone: true,
    inputs: ["formArrayName"],
  };
  name: string | number | null = null;
  control: FormArray<any> = new FormArray([]);
}

export class NgModel<T = any> {
  static readonly ɵdir = {
    selector: "[ngModel]:not([formControlName]):not([formControl])",
    standalone: true,
    inputs: ["ngModel", "name", "disabled", "ngModelOptions"],
    outputs: ["ngModelChange"],
    exportAs: ["ngModel"],
  };
  name = "";
  model!: T;
  disabled = false;
  options?: {
    name?: string;
    standalone?: boolean;
    updateOn?: "change" | "blur" | "submit";
  };
  readonly control: FormControl<T>;
  readonly update = new OutputEmitterRef<T>();

  constructor(
    initialValue: T = undefined as unknown as T,
    validators?: ValidatorFn | ValidatorFn[] | null,
  ) {
    this.model = initialValue;
    this.control = new FormControl<T>(initialValue, validators ?? null);
  }

  get value(): T {
    return this.control.valueSignal();
  }

  get valid(): boolean {
    return this.control.validSignal();
  }

  get invalid(): boolean {
    return !this.control.validSignal();
  }

  get pending(): boolean {
    return this.control.statusSignal() === "PENDING";
  }

  get status(): FormControlStatus {
    return this.control.statusSignal();
  }

  get errors(): ValidationErrors | null {
    return this.control.errorsSignal();
  }

  get pristine(): boolean {
    return this.control.pristineSignal();
  }

  get dirty(): boolean {
    return !this.control.pristineSignal();
  }

  get touched(): boolean {
    return this.control.touchedSignal();
  }

  get untouched(): boolean {
    return !this.control.touchedSignal();
  }

  viewToModelUpdate(newValue: T): void {
    this.model = newValue;
    this.control.setValue(newValue);
    this.control.markAsDirty();
    this.update.emit(newValue);
  }

  reset(value?: T): void {
    if (value !== undefined) {
      this.model = value;
    }
    this.control.reset(value);
  }
}

export class NgForm {
  static readonly ɵdir = {
    selector: "form:not([ngNoForm]):not([formGroup]),ng-form,[ngForm]",
    standalone: true,
    outputs: ["ngSubmit"],
    exportAs: ["ngForm"],
  };
  form = new FormGroup({});
  readonly ngSubmit = new OutputEmitterRef<Event | undefined>();
  readonly #submittedSignal = signal(false);

  get submitted(): boolean {
    return this.#submittedSignal();
  }

  set submitted(val: boolean) {
    this.#submittedSignal.set(val);
    if (val) {
      this.form.markAsSubmitted();
    } else {
      this.form.reset(this.form.getRawValue());
    }
  }

  get control(): FormGroup {
    return this.form;
  }

  get controls(): { [key: string]: AbstractControl<any, any> } {
    return this.form.controls;
  }

  get value(): any {
    return this.form.valueSignal();
  }

  get valid(): boolean {
    return this.form.validSignal();
  }

  get invalid(): boolean {
    return !this.form.validSignal();
  }

  get pending(): boolean {
    return this.form.statusSignal() === "PENDING";
  }

  get status(): FormControlStatus {
    return this.form.statusSignal();
  }

  get errors(): ValidationErrors | null {
    return this.form.errorsSignal();
  }

  get pristine(): boolean {
    return this.form.pristineSignal();
  }

  get dirty(): boolean {
    return !this.form.pristineSignal();
  }

  get touched(): boolean {
    return this.form.touchedSignal();
  }

  get untouched(): boolean {
    return !this.form.touchedSignal();
  }

  onSubmit($event?: Event): boolean {
    this.#submittedSignal.set(true);
    this.form.markAsSubmitted();
    this.ngSubmit.emit($event);
    return false;
  }

  resetForm(value?: any): void {
    this.#submittedSignal.set(false);
    this.form.reset(value);
  }

  reset(value?: any): void {
    this.#submittedSignal.set(false);
    this.form.reset(value);
  }
}

export const SHARED_FORM_DIRECTIVES = [
  DefaultValueAccessor,
  CheckboxControlValueAccessor,
  NumberValueAccessor,
  SelectControlValueAccessor,
] as const;

export const REACTIVE_DRIVEN_DIRECTIVES = [
  ...SHARED_FORM_DIRECTIVES,
  FormControlDirective,
  FormGroupDirective,
  FormControlName,
  FormGroupName,
  FormArrayName,
] as const;

export const TEMPLATE_DRIVEN_DIRECTIVES = [
  ...SHARED_FORM_DIRECTIVES,
  NgModel,
  NgForm,
] as const;

export interface ReactiveFormsModuleConfig {
  warnOnDeprecatedNgFormSelector?: "never" | "once" | "always";
  callSetDisabledState?: "always" | "whenDisabledForLegacyCode";
}

export class ReactiveFormsModule {
  readonly ɵkind = "NgModule";
  static readonly ɵmod = {
    imports: REACTIVE_DRIVEN_DIRECTIVES,
    exports: REACTIVE_DRIVEN_DIRECTIVES,
  };

  static withConfig(_opts?: ReactiveFormsModuleConfig): {
    ngModule: typeof ReactiveFormsModule;
    providers: Provider[];
  } {
    return {
      ngModule: ReactiveFormsModule,
      providers: [],
    };
  }
}

export interface FormsModuleConfig {
  callSetDisabledState?: "always" | "whenDisabledForLegacyCode";
}

export class FormsModule {
  readonly ɵkind = "NgModule";
  static readonly ɵmod = {
    imports: TEMPLATE_DRIVEN_DIRECTIVES,
    exports: TEMPLATE_DRIVEN_DIRECTIVES,
  };

  static withConfig(_opts?: FormsModuleConfig): {
    ngModule: typeof FormsModule;
    providers: Provider[];
  } {
    return {
      ngModule: FormsModule,
      providers: [],
    };
  }
}

/**
 * Resolves a child `AbstractControl` from a parent `FormGroup`, `FormRecord`, or `FormArray`
 * by name, index, or dot-delimited path.
 */
export function resolveAngularFormControl(
  container:
    | AbstractControl
    | (() => AbstractControl | null | undefined)
    | null
    | undefined,
  path: string | number | Array<string | number>,
): AbstractControl | null {
  const resolved = typeof container === "function" ? container() : container;
  if (!resolved || typeof resolved.get !== "function") {
    return null;
  }
  return resolved.get(typeof path === "number" ? [path] : path);
}

/**
 * Computes Angular form status CSS classes (`ng-untouched`/`ng-touched`, `ng-pristine`/`ng-dirty`, `ng-valid`/`ng-invalid`/`ng-pending`).
 */
export function getAngularControlStatusClasses(
  control: AbstractControl | null | undefined,
): string {
  if (!control) return "";
  const touched = control.touchedSignal() ? "ng-touched" : "ng-untouched";
  const pristine = control.pristineSignal() ? "ng-pristine" : "ng-dirty";
  const status = control.statusSignal();
  const validity =
    status === "VALID"
      ? "ng-valid"
      : status === "INVALID"
        ? "ng-invalid"
        : status === "PENDING"
          ? "ng-pending"
          : "";
  return [touched, pristine, validity].filter(Boolean).join(" ");
}

/**
 * Binds an `AbstractControl` (`[formControl]` or `formControlName`) onto an `<input>`, `<textarea>`, or `<select>` props object.
 */
export function bindAngularFormControl(
  controlOrGetter:
    | AbstractControl
    | (() => AbstractControl | null | undefined)
    | null
    | undefined,
  baseProps?: Record<string, any> | null,
  kind: "text" | "checkbox" | "number" | "select" = "text",
): Record<string, any> {
  const getCtrl = (): AbstractControl | null | undefined =>
    typeof controlOrGetter === "function" ? controlOrGetter() : controlOrGetter;

  const out: Record<string, any> = { ...baseProps };
  const baseClass = out.class;
  out.class = () => {
    const existing =
      typeof baseClass === "function" ? baseClass() : (baseClass ?? "");
    const statusClasses = getAngularControlStatusClasses(getCtrl());
    return [existing, statusClasses].filter(Boolean).join(" ");
  };

  const baseDisabled = out.disabled;
  out.disabled = () => {
    const ctrl = getCtrl();
    if (ctrl && ctrl.statusSignal() === "DISABLED") return true;
    const rawDisabled =
      typeof baseDisabled === "function" ? baseDisabled() : baseDisabled;
    return Boolean(rawDisabled);
  };

  if (kind === "checkbox") {
    out.checked = () => Boolean(getCtrl()?.valueSignal());
    const prevChange = out["on:change"];
    out["on:change"] = ($event: any) => {
      const ctrl = getCtrl();
      if (ctrl && ctrl.statusSignal() !== "DISABLED") {
        const next = Boolean(($event?.currentTarget as any)?.checked);
        ctrl.setValue(next);
        ctrl.markAsDirty();
      }
      if (typeof prevChange === "function") prevChange($event);
    };
  } else if (kind === "number") {
    out.value = () => {
      const val = getCtrl()?.valueSignal();
      return val === null || val === undefined ? "" : String(val);
    };
    const prevInput = out["on:input"];
    out["on:input"] = ($event: any) => {
      const ctrl = getCtrl();
      if (ctrl && ctrl.statusSignal() !== "DISABLED") {
        const raw = String(($event?.currentTarget as any)?.value ?? "");
        const next = raw === "" ? null : Number(raw);
        ctrl.setValue(next);
        ctrl.markAsDirty();
      }
      if (typeof prevInput === "function") prevInput($event);
    };
  } else if (kind === "select") {
    out.value = () => String(getCtrl()?.valueSignal() ?? "");
    const prevChange = out["on:change"];
    out["on:change"] = ($event: any) => {
      const ctrl = getCtrl();
      if (ctrl && ctrl.statusSignal() !== "DISABLED") {
        const next = String(($event?.currentTarget as any)?.value ?? "");
        ctrl.setValue(next);
        ctrl.markAsDirty();
      }
      if (typeof prevChange === "function") prevChange($event);
    };
  } else {
    out.value = () => String(getCtrl()?.valueSignal() ?? "");
    const prevInput = out["on:input"];
    out["on:input"] = ($event: any) => {
      const ctrl = getCtrl();
      if (ctrl && ctrl.statusSignal() !== "DISABLED") {
        const next = String(($event?.currentTarget as any)?.value ?? "");
        ctrl.setValue(next);
        ctrl.markAsDirty();
      }
      if (typeof prevInput === "function") prevInput($event);
    };
  }

  const prevBlur = out["on:blur"];
  out["on:blur"] = ($event: any) => {
    getCtrl()?.markAsTouched();
    if (typeof prevBlur === "function") prevBlur($event);
  };

  return out;
}

/**
 * Binds a `FormGroup`, `FormArray`, or `NgForm` (`[formGroup]`, `formGroupName`, `formArrayName`, `#f="ngForm"`)
 * and optional `(ngSubmit)` onto a container/form props object.
 */
export function bindAngularFormGroup(
  groupOrGetter:
    | AbstractControl
    | NgForm
    | (() => AbstractControl | NgForm | null | undefined)
    | null
    | undefined,
  baseProps?: Record<string, any> | null,
  onNgSubmit?: ($event: any) => void,
  onRegisterNgForm?: (form: NgForm) => void,
): Record<string, any> {
  const initialRaw =
    typeof groupOrGetter === "function"
      ? untrack(groupOrGetter)
      : groupOrGetter;
  const fallbackNgForm =
    initialRaw instanceof NgForm
      ? initialRaw
      : onRegisterNgForm
        ? new NgForm()
        : null;
  if (fallbackNgForm && onRegisterNgForm) {
    onRegisterNgForm(fallbackNgForm);
  }
  const getRaw = (): AbstractControl | NgForm | null | undefined => {
    const resolved =
      typeof groupOrGetter === "function" ? groupOrGetter() : groupOrGetter;
    return resolved ?? fallbackNgForm;
  };
  const getGrp = (): AbstractControl | null | undefined => {
    const raw = getRaw();
    return raw instanceof NgForm ? raw.form : raw;
  };

  const out: Record<string, any> = { ...baseProps };
  const baseClass = out.class;
  out.class = () => {
    const existing =
      typeof baseClass === "function" ? baseClass() : (baseClass ?? "");
    const statusClasses = getAngularControlStatusClasses(getGrp());
    return [existing, statusClasses].filter(Boolean).join(" ");
  };

  if (onNgSubmit || out["on:submit"] || fallbackNgForm) {
    const prevSubmit = out["on:submit"];
    out["on:submit"] = ($event: any) => {
      if (typeof $event?.preventDefault === "function") {
        $event.preventDefault();
      }
      const raw = getRaw();
      if (raw instanceof NgForm) {
        raw.onSubmit($event);
      } else {
        raw?.markAsSubmitted();
      }
      if (typeof prevSubmit === "function") prevSubmit($event);
      if (typeof onNgSubmit === "function") onNgSubmit($event);
    };
  }

  return out;
}

export interface AngularNgModelBindingConfig<T = any> {
  getValue: () => T;
  setValue?: (value: T) => void;
  onModelChange?: (value: T) => void;
  options?: () =>
    | {
        name?: string;
        standalone?: boolean;
        updateOn?: "change" | "blur" | "submit";
      }
    | undefined;
  parentGroup?: () => AbstractControl | NgForm | null | undefined;
  onRegisterNgModel?: (dir: NgModel<T>) => void;
}

/**
 * Binds template-driven `[(ngModel)]`, `[ngModel]`, `(ngModelChange)`, and `#ctrl="ngModel"`
 * onto an `<input>`, `<textarea>`, or `<select>` props object with HTML validator inference
 * and reactive Angular form status classes.
 */
export function bindAngularNgModel<T = any>(
  config: AngularNgModelBindingConfig<T>,
  baseProps?: Record<string, any> | null,
  kind: "text" | "checkbox" | "number" | "select" = "text",
): Record<string, any> {
  const validators: ValidatorFn[] = [];
  if (baseProps) {
    const reqProp = baseProps.required;
    if (reqProp !== undefined && reqProp !== false && reqProp !== "false") {
      validators.push(
        kind === "checkbox" ? Validators.requiredTrue : Validators.required,
      );
    }
    const minLenProp = baseProps.minlength ?? baseProps.minLength;
    if (minLenProp !== undefined) {
      const n = Number(
        typeof minLenProp === "function" ? minLenProp() : minLenProp,
      );
      if (!Number.isNaN(n)) validators.push(Validators.minLength(n));
    }
    const maxLenProp = baseProps.maxlength ?? baseProps.maxLength;
    if (maxLenProp !== undefined) {
      const n = Number(
        typeof maxLenProp === "function" ? maxLenProp() : maxLenProp,
      );
      if (!Number.isNaN(n)) validators.push(Validators.maxLength(n));
    }
    if (baseProps.min !== undefined) {
      const n = Number(
        typeof baseProps.min === "function" ? baseProps.min() : baseProps.min,
      );
      if (!Number.isNaN(n)) validators.push(Validators.min(n));
    }
    if (baseProps.max !== undefined) {
      const n = Number(
        typeof baseProps.max === "function" ? baseProps.max() : baseProps.max,
      );
      if (!Number.isNaN(n)) validators.push(Validators.max(n));
    }
    if (baseProps.pattern !== undefined) {
      const pat =
        typeof baseProps.pattern === "function"
          ? baseProps.pattern()
          : baseProps.pattern;
      if (pat) validators.push(Validators.pattern(pat));
    }
    const emailProp = baseProps.email;
    if (
      emailProp !== undefined &&
      emailProp !== false &&
      emailProp !== "false"
    ) {
      validators.push(Validators.email);
    }
  }

  const initialVal = untrack(() => config.getValue());
  const ngModelDir = new NgModel<T>(initialVal, validators);
  const opts = untrack(() => config.options?.());
  const rawName =
    opts?.name ??
    (typeof baseProps?.name === "function"
      ? untrack(() => baseProps.name())
      : baseProps?.name);
  if (typeof rawName === "string" && rawName.length > 0) {
    ngModelDir.name = rawName;
    if (!opts?.standalone) {
      const parent = untrack(() => config.parentGroup?.());
      const grp = parent instanceof NgForm ? parent.form : parent;
      if (grp instanceof FormGroup) {
        grp.addControl(rawName, ngModelDir.control, { emitEvent: false });
      }
    }
  }

  if (config.onRegisterNgModel) {
    config.onRegisterNgModel(ngModelDir);
  }

  const syncControlFromModel = (): T => {
    const currentModelVal = config.getValue();
    const ctrlVal = untrack(() => ngModelDir.control.valueSignal());
    if (!Object.is(currentModelVal, ctrlVal)) {
      untrack(() => {
        ngModelDir.model = currentModelVal;
        ngModelDir.control.setValue(currentModelVal, { emitEvent: false });
      });
    }
    return ngModelDir.control.valueSignal();
  };

  const out: Record<string, any> = { ...baseProps };
  const baseClass = out.class;
  out.class = () => {
    syncControlFromModel();
    const existing =
      typeof baseClass === "function" ? baseClass() : (baseClass ?? "");
    const statusClasses = getAngularControlStatusClasses(ngModelDir.control);
    return [existing, statusClasses].filter(Boolean).join(" ");
  };

  const baseDisabled = out.disabled;
  out.disabled = () => {
    if (ngModelDir.control.statusSignal() === "DISABLED") return true;
    const rawDisabled =
      typeof baseDisabled === "function" ? baseDisabled() : baseDisabled;
    return Boolean(rawDisabled);
  };

  const applyViewUpdate = (nextVal: T) => {
    if (ngModelDir.control.statusSignal() === "DISABLED") return;
    ngModelDir.viewToModelUpdate(nextVal);
    config.setValue?.(nextVal);
    config.onModelChange?.(nextVal);
  };

  if (kind === "checkbox") {
    out.checked = () => Boolean(syncControlFromModel());
    const prevChange = out["on:change"];
    out["on:change"] = ($event: any) => {
      const next = Boolean(
        ($event?.currentTarget as any)?.checked,
      ) as unknown as T;
      applyViewUpdate(next);
      if (typeof prevChange === "function") prevChange($event);
    };
  } else if (kind === "number") {
    out.value = () => {
      const val = syncControlFromModel();
      return val === null || val === undefined ? "" : String(val);
    };
    const prevInput = out["on:input"];
    out["on:input"] = ($event: any) => {
      const raw = String(($event?.currentTarget as any)?.value ?? "");
      const next = (raw === "" ? null : Number(raw)) as unknown as T;
      applyViewUpdate(next);
      if (typeof prevInput === "function") prevInput($event);
    };
  } else if (kind === "select") {
    out.value = () => String(syncControlFromModel() ?? "");
    const prevChange = out["on:change"];
    out["on:change"] = ($event: any) => {
      const next = String(
        ($event?.currentTarget as any)?.value ?? "",
      ) as unknown as T;
      applyViewUpdate(next);
      if (typeof prevChange === "function") prevChange($event);
    };
  } else {
    out.value = () => String(syncControlFromModel() ?? "");
    const prevInput = out["on:input"];
    out["on:input"] = ($event: any) => {
      const next = String(
        ($event?.currentTarget as any)?.value ?? "",
      ) as unknown as T;
      applyViewUpdate(next);
      if (typeof prevInput === "function") prevInput($event);
    };
  }

  const prevBlur = out["on:blur"];
  out["on:blur"] = ($event: any) => {
    ngModelDir.control.markAsTouched();
    if (typeof prevBlur === "function") prevBlur($event);
  };

  return out;
}
