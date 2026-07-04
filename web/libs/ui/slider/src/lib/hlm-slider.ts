import { ChangeDetectionStrategy, Component } from '@angular/core';
import { BrnSlider, BrnSliderImports, injectBrnSlider } from '@spartan-ng/brain/slider';
import { classes } from '@spartan-ng/helm/utils';

@Component({
	selector: 'hlm-slider, brn-slider [hlm]',
	imports: [BrnSliderImports],
	changeDetection: ChangeDetectionStrategy.OnPush,
	hostDirectives: [
		{
			directive: BrnSlider,
			inputs: [
				'id',
				'value',
				'disabled',
				'min',
				'max',
				'step',
				'minStepsBetweenThumbs',
				'inverted',
				'orientation',
				'showTicks',
				'maxTicks',
				'tickLabelInterval',
				'formatTick',
				'draggableRange',
				'draggableRangeOnly',
				'aria-label',
				'aria-labelledby',
			],
			outputs: ['valueChange'],
		},
	],
	template: `
		<div class="relative flex w-full items-center group-data-vertical:w-auto group-data-vertical:flex-col">
			<div brnSliderTrack class="bg-input/90 rounded-full data-horizontal:h-2 data-horizontal:w-full data-vertical:h-full data-vertical:w-2 relative grow overflow-hidden">
				<div
					class="bg-primary absolute select-none data-draggable-range:cursor-move data-horizontal:h-full data-vertical:w-full"
					brnSliderRange
				></div>
			</div>

			@for (i of _slider.thumbIndexes(); track i) {
				<span
					class="hover:ring-ring/30 focus-visible:ring-ring/30 h-4 w-6 rounded-full bg-white shadow-md ring-1 ring-black/10 transition-[color,box-shadow,background-color] not-dark:bg-clip-padding hover:ring-4 focus-visible:ring-4 focus-visible:outline-hidden data-vertical:h-6 data-vertical:w-4 absolute block shrink-0 select-none after:absolute after:-inset-2"
					brnSliderThumb
				></span>
			}
		</div>

		@if (_slider.showTicks()) {
			<div
				class="px-3 group-data-vertical:px-0 group-data-vertical:py-3 text-muted-foreground mt-3 flex w-full items-start justify-between gap-1 text-xs font-medium group-data-horizontal:group-data-inverted:flex-row-reverse group-data-vertical:ms-3 group-data-vertical:mt-0 group-data-vertical:w-auto group-data-vertical:flex-col-reverse group-data-vertical:group-data-inverted:flex-col"
			>
				<div
					*brnSliderTick="let tick; let formattedTick = formattedTick"
					class="group flex w-0 flex-col items-center justify-center gap-2 group-data-vertical:h-0 group-data-vertical:w-auto group-data-vertical:flex-row"
				>
					<div
						class="bg-muted-foreground/70 h-1 w-px group-data-vertical:h-px group-data-vertical:w-1 group-data-horizontal:group-data-[skip]:h-0.5 group-data-vertical:group-data-[skip]:w-0.5"
					></div>
					<div class="text-center group-data-[skip]:opacity-0">{{ formattedTick }}</div>
				</div>
			</div>
		}
	`,
})
export class HlmSlider {
	protected readonly _slider = injectBrnSlider();

	constructor() {
		classes(() => [
			'group flex w-full touch-none flex-col select-none data-vertical:h-full data-vertical:min-h-40 data-vertical:w-auto data-vertical:flex-row data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
		]);
	}
}
