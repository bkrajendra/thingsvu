import { Directive, input } from '@angular/core';
import { classes } from '@spartan-ng/helm/utils';
import { cva } from 'class-variance-authority';

const buttonGroupVariants = cva(
	"has-[>[data-variant=outline]]:[&>input]:border-border has-[>[data-variant=outline]]:[&>input:focus-visible]:border-ring has-[>[data-variant=outline]]:*:data-[slot=input-group]:border-border has-[>[data-variant=outline]]:[&>[data-slot=input-group]:has(:focus-visible)]:border-ring has-[>[data-variant=outline]]:*:data-[slot=select-trigger]:border-border has-[>[data-variant=outline]]:[&>[data-slot=select-trigger]:focus-visible]:border-ring has-[>[data-slot=button-group]]:gap-2 has-[select[aria-hidden=true]:last-child]:[&>[data-slot=select-trigger]:last-of-type]:rounded-r-4xl flex w-fit items-stretch *:focus-visible:relative *:focus-visible:z-10 [&>[data-slot=select-trigger]:not([class*='w-'])]:w-fit [&>input]:flex-1",
	{
		variants: {
			orientation: {
				horizontal:
					'[&>[data-slot]:not(:has(~[data-slot]))]:rounded-e-4xl [&>*:not(:first-child)]:rounded-s-none [&>*:not(:first-child)]:border-s-0 [&>*:not(:last-child)]:rounded-e-none',
				vertical:
					'[&>[data-slot]:not(:has(~[data-slot]))]:rounded-b-4xl flex-col [&>*:not(:first-child)]:rounded-t-none [&>*:not(:first-child)]:border-t-0 [&>*:not(:last-child)]:rounded-b-none',
			},
		},
		defaultVariants: {
			orientation: 'horizontal',
		},
	},
);

@Directive({
	selector: '[hlmButtonGroup],hlm-button-group',
	host: {
		'data-slot': 'button-group',
		role: 'group',
		'[attr.data-orientation]': 'orientation()',
	},
})
export class HlmButtonGroup {
	constructor() {
		classes(() => buttonGroupVariants({ orientation: this.orientation() }));
	}

	public readonly orientation = input<'horizontal' | 'vertical'>('horizontal');
}
