import type { NumberInput } from '@angular/cdk/coercion';
import { ChangeDetectionStrategy, Component, input, numberAttribute } from '@angular/core';
import { BrnInputOtpSlot } from '@spartan-ng/brain/input-otp';
import { classes } from '@spartan-ng/helm/utils';
import { HlmInputOtpFakeCaret } from './hlm-input-otp-fake-caret';

@Component({
	selector: 'hlm-input-otp-slot',
	imports: [BrnInputOtpSlot, HlmInputOtpFakeCaret],
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: { 'data-slot': 'input-otp-slot' },
	template: `
		<brn-input-otp-slot [index]="index()">
			<hlm-input-otp-fake-caret />
		</brn-input-otp-slot>
	`,
})
export class HlmInputOtpSlot {
	/** The index of the slot to render the char or a fake caret */
	public readonly index = input.required<number, NumberInput>({ transform: numberAttribute });

	constructor() {
		classes(
			() =>
				'bg-input/50 border-input has-[brn-input-otp-slot[data-active="true"]]:border-ring has-[brn-input-otp-slot[data-active="true"]]:ring-ring/30 has-[brn-input-otp-slot[data-active="true"]]:data-[matches-spartan-invalid=true]:ring-destructive/20 dark:has-[brn-input-otp-slot[data-active="true"]]:data-[matches-spartan-invalid=true]:ring-destructive/40 data-[matches-spartan-invalid=true]:border-destructive size-9 border-y border-e text-sm transition-all outline-none first:rounded-s-3xl first:border-s last:rounded-e-3xl has-[brn-input-otp-slot[data-active="true"]]:ring-3 relative flex items-center justify-center has-[brn-input-otp-slot[data-active="true"]]:z-10',
		);
	}
}
