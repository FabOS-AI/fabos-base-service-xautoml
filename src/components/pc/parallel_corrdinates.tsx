import * as cpc from "./model";
import React from "react";
import * as d3 from "d3";
import {Runhistory} from "../../model";
import {ParCord} from "./util";
import {PCChoice} from "./pc_choice";
import {PCLine} from "./pc_line";
import {FlexibleSvg} from "../../util/flexible-svg";


interface PCProps {
    runhistory: Runhistory
}

interface PCState {
    model: cpc.Model
    highlightedLines: Set<string>
    container: React.RefObject<any>
}

export class ParallelCoordinates extends React.Component<PCProps, PCState> {

    private readonly HEIGHT = 65
    private readonly root: cpc.Choice;

    constructor(props: PCProps) {
        super(props)
        this.state = {
            model: ParCord.parseRunhistory(this.props.runhistory),
            highlightedLines: new Set<string>(),
            container: undefined
        }

        // init root node
        this.root = new cpc.Choice('', this.state.model.axes, false);

        this.onCollapse = this.onCollapse.bind(this)
        this.onExpand = this.onExpand.bind(this)
        this.highlightLines = this.highlightLines.bind(this)
        this.updateContainer = this.updateContainer.bind(this)
    }

    private onCollapse(choice: cpc.Choice) {
        choice.setCollapsed(true)
        this.setState({model: this.state.model})
    }

    private onExpand(choice: cpc.Choice) {
        choice.setCollapsed(false)
        this.setState({model: this.state.model})
    }

    private highlightLines(axis: cpc.Axis, choice: cpc.Choice) {
        const highlights = !!axis && !!choice ? this.state.model.lines
            .filter(l => l.intersects(axis, choice))
            .map(l => l.id) : []
        this.setState({highlightedLines: new Set<string>(highlights)})
    }

    private updateContainer(container: React.RefObject<any>) {
        this.setState({container: container})
    }

    public render() {
        const {model, highlightedLines, container} = this.state
        const width = (container && container.current) ? container.current.clientWidth : 0

        // Estimate height based on maximum number of components
        const height = this.HEIGHT * Math.max(...this.root.axes.map(a => a.choices.length))
        const yScale = d3.scaleBand([this.root.label.toString()], [0, height / this.root.getHeightWeight()])
        this.root.layout([0, width], yScale)

        return (
            <FlexibleSvg height={height} onContainerChange={this.updateContainer}>
                <PCChoice choice={this.root} parent={undefined}
                          onCollapse={this.onCollapse}
                          onExpand={this.onExpand}
                          onChoiceHover={this.highlightLines}/>
                {this.state.model.lines.map(line => {
                        return <PCLine key={line.id}
                                       model={model}
                                       line={line}
                                       highlight={highlightedLines.has(line.id)}/>
                    }
                )}
            </FlexibleSvg>
        )
    }
}
