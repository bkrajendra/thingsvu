import { Directive } from '@angular/core';
import { BrnFieldControlDescribedBy } from '@spartan-ng/brain/field';
import { BrnTextarea } from '@spartan-ng/brain/textarea';
import { classes } from '@spartan-ng/helm/utils';

@Directive({
	selector: '[hlmTextarea]',
	hostDirectives: [{ directive: BrnTextarea, inputs: ['id', 'forceInvalid'] }, BrnFieldControlDescribedBy],
	host: { 'data-slot': 'textarea' },
})
export class HlmTextarea {
	constructor() {
		classes(
			() =>
				'bg-input/50 focus-visible:border-ring focus-visible:ring-ring/30 data-[matches-spartan-invalid=true]:ring-destructive/20 dark:data-[matches-spartan-invalid=true]:ring-destructive/40 data-[matches-spartan-invalid=true]:border-destructive dark:data-[matches-spartan-invalid=true]:border-destructive/50 resize-none rounded-2xl border border-transparent px-3 py-3 text-base transition-[color,box-shadow,background-color] focus-visible:ring-3 data-[matches-spartan-invalid=true]:ring-3 md:text-sm placeholder:text-muted-foreground flex field-sizing-content min-h-16 w-full outline-none disabled:cursor-not-allowed disabled:opacity-50',
		);
	}
}
