Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',

    _features: {}, /* key will be objectid */
    _async_flags: {}, /* key is object id of release work item looking up the tree */
    _feature_map: {}, /* key will be objectid */
    
    logger: new Rally.technicalservices.logger(),
    items: [
        {xtype:'container',itemId:'selector_box',margin: 5, layout:{type:'hbox'}},
        {xtype:'container',itemId:'chart_box' },
        {xtype:'tsinfolink'}
    ],
    launch: function() {
        this._addSummary();
    },
    _addSummary: function() {
        var selector_box = this.down('#selector_box');
        selector_box.add({
            xtype:'rallyreleasecombobox',
            itemId:'releasebox',
            listeners: {
                scope: this,
                change: function(rb, new_value, old_value) {
                    this._asynch_return_flags = {};
                    //this._getSprints();
                    this._getItemsInRelease();
                },
                ready: function(rb) {
                    this._asynch_return_flags = {};
                    //this._getSprints();
                    this._getItemsInRelease();
                }
            }
        });
    },
    _getItemsInRelease: function() {
        if ( this.down('#selector_box').getEl() ) {
            this.down('#selector_box').getEl().mask("Finding Items in Release...");
        }
        this.down('#chart_box').removeAll();
        // clear out trackers
        this._features = {};
        this._async_flags = {defect:1,story:1};
        this._feature_map = {};

        this._getStoriesInRelease();
        this._getDefectsInRelease();
    },
    _getDefectsInRelease: function() {
        var me = this;
        this.logger.log(this,"_getDefectsInRelease");
        var release = this.down('#releasebox').getRecord();
        var release_name = release.get('Name');
        
        var fetch = ['FormattedID','PlanEstimate','Requirement','Name','ObjectID','AcceptedDate'];
        var filters = [{property:'Release.Name',value:release_name}];
        Ext.create('Rally.data.WsapiDataStore',{
            model:'Defect',
            autoLoad: true,
            filters: filters,
            limit:'Infinity',
            fetch: fetch,
            listeners: {
                scope: this,
                load: function(store,defects){
                    me.logger.log(this,"    ...got defects in release",defects.length);
                    
                    Ext.Array.each(defects,function(defect){  
                        if ( defect.get('Requirement') !== null ) {
                            defect.set('Parent',defect.get('Requirement'));
                            
                            me._async_flags[defect.get('ObjectID')] = 1;
                            me._getTopLevelParent(defect,defect);
                        } else {
                            me._features[defect.get('ObjectID')] = defect;
                            me._addToFeature(defect,defect);
                        }
                    });
                    delete me._async_flags["defect"];
                    this.logger.log(this,"   ...defects set");
                    this._makeChart();
                }
            }
        });
    },
    _getStoriesInRelease: function() {
        var me = this;
        this.logger.log(this,"_getStoriesInRelease");

        var release = this.down('#releasebox').getRecord();
        var release_name = release.get('Name');
        
        var fetch = ['FormattedID','PlanEstimate','Parent','Name','ObjectID','AcceptedDate'];
        var filters = [{property:'Release.Name',value:release_name}];
        Ext.create('Rally.data.WsapiDataStore',{
            model:'UserStory',
            autoLoad: true,
            filters: filters,
            limit:'Infinity',
            fetch: fetch,
            sorters: [
                {
                    property: 'LastUpdateDate',
                    direction: 'DESC'
                }
            ],
            listeners: {
                scope: this,
                load: function(store,stories){
                    me.logger.log(this,"    ...got stories in release",stories.length);
                    if ( this.down('#selector_box').getEl() ) {
                        this.down('#selector_box').getEl().mask("Finding Associated Features...");
                    }
                    var length = stories.length;
                    for ( var i=0; i<length; i++ ) {
                        var story = stories[i];
                        if ( story.get('Parent') !== null ) {
                            me._async_flags[story.get('ObjectID')] = 1;
                            me._getTopLevelParent(story,story);
                        } else {
                            me._features[story.get('ObjectID')] = story;
                            me._addToFeature(story,story,story);
                        }
                    }
                    delete me._async_flags["story"];
                    this.logger.log(this,"... story set");
                    this._makeChart();
                }
            }
        });
    },
    _addToFeature: function(feature,item){
        this._feature_map[item.get('ObjectID')] = feature.get('ObjectID');
        
        var feature_total_us = feature.get('total_planned_us') || 0;
        var feature_total_de = feature.get('total_planned_de') || 0;
        var feature_accepted_us = feature.get('total_accepted_us') || 0;
        var feature_accepted_de = feature.get('total_accepted_de') || 0;
        // reset
        feature.set('total_planned_us',feature_total_us);
        feature.set('total_planned_de',feature_total_de);
        feature.set('total_accepted_us',feature_accepted_us);
        feature.set('total_accepted_de',feature_accepted_de);
        
        var feature_count = feature.get('child_count') || 0;
        
        var plan_estimate = item.get('PlanEstimate') || 0;
        var type = item.get('_type');
        if ( type == "hierarchicalrequirement" ) {
            feature.set('total_planned_us',feature_total_us + plan_estimate);
        } else {
            feature.set('total_planned_de',feature_total_de + plan_estimate);
        }
        
        if ( item.get('AcceptedDate') ) {
            if ( type == "hierarchicalrequirement" ) {
                feature.set('total_accepted_us',feature_accepted_us + plan_estimate);
            } else {
                feature.set('total_accepted_de',feature_accepted_de + plan_estimate);
            }
        }
        feature.set('child_count',feature_count + 1);
    },
    // keep track of calls as we spray a bunch of async calls looking for the most top level parent
    // hierarchy is an array to hold on to for the story tree in case we can use it for pulling a feature without querying
    _getTopLevelParent: function(story,original_child,hierarchy) {
        this.logger.log(this,"_getTopLevelParent",story.get('FormattedID'), 'root', original_child.get('FormattedID'));
        var me = this;
        var fetch = ['FormattedID','PlanEstimate','Parent','Name','ObjectID'];
        var filters = [{property:'ObjectID',value:story.get('Parent').ObjectID}];
        if ( !hierarchy ) {
            hierarchy = [original_child.get('ObjectID')];
        }
        
        // check first to see if this is in the map (so we don't bother the network)
        if ( me._feature_map[story.get('Parent').ObjectID] ) {
            me.logger.log(this,"Pulling from hash (parent) instead of querying");
            var feature = me._features[me._feature_map[story.get('Parent').ObjectID]];
            me._addToFeature(feature,original_child);
            delete me._async_flags[original_child.get('ObjectID')];
            me._makeChart();
        } else if (me._feature_map[story.get('ObjectID')] ) {
            me.logger.log(this,"Pulling from hash (story) instead of querying");
            var feature = me._features[me._feature_map[story.get('ObjectID')]];
            me._addToFeature(feature,original_child);
            delete me._async_flags[original_child.get('ObjectID')];
            me._makeChart();
        } else {
            // go get story's parent
            Ext.create('Rally.data.WsapiDataStore',{
                model:'UserStory',
                autoLoad: true,
                filters: filters,
                fetch: fetch,
                context: {
                    project: null
                },
                listeners: {
                    scope: this,
                    load: function(store,parents){
                        if ( parents.length == 0 ) {
                            throw "ERROR: Can't find parent for " + story.get('FormattedID');
                            me._makeChart();
                        }
                        Ext.Array.each(parents,function(parent){
                            hierarchy.push(parent.get('ObjectID'));
                            if ( parent.get('Parent') !== null ) {
                                me._getTopLevelParent(parent,original_child,hierarchy);
                            } else {
                                Ext.Array.each(hierarchy,function(oid){
                                    me._feature_map[oid] = parent.get('ObjectID');
                                });
                                // we're at the top
                                if ( !me._features[parent.get('ObjectID')] ) {
                                    me._features[parent.get('ObjectID')] = parent;
                                }
                                // put into map hash for easy pulling later
                                me._addToFeature(me._features[parent.get('ObjectID')], original_child);
                                delete me._async_flags[original_child.get('ObjectID')];
                                me.logger.log(me,"Feature",parent.get('FormattedID'));
                                me._makeChart();
                            }
                        });
                    }
                }
            });
        }
    },
    _sortFeatures: function(a,b) {
        var name_a = "";
        var name_b = "";
        
        if ( a && a.get('Name') ) {
            name_a = a.get('Name');
        }
        
        if ( b && b.get('Name') ) {
            name_b = b.get('Name');
        }
        return name_a.localeCompare(name_b);
    },
    _getChartData: function() {
        var me = this;
        this.logger.log(this,"_getChartData");
        var chart_data = [];
        
        var features = [];
        Ext.Object.each(me._features, function(feature_oid,feature){
            features.push(feature);
        });
       
        this.logger.log(this,"sorting features...");
        features.sort(me._sortFeatures);
        this.logger.log(this,"...done", features.length, "features");
        
        var total_planned_us = [];
        var total_planned_de = [];
        var total_accepted_us = [];
        var total_accepted_de = [];
        var names = [];
        
        Ext.Array.each(features, function(feature){
            me.logger.log(me,feature.get('Name'), feature.get('child_count'));
            names.push(feature.get('Name'));
            total_planned_us.push(feature.get('total_planned_us'));
            total_planned_de.push(feature.get('total_planned_de'));
            total_accepted_us.push(feature.get('total_accepted_us'));
            total_accepted_de.push(feature.get('total_accepted_de'));
        });

        var series = [
            {
                type: 'column',
                data: total_planned_us,
                visible: true,
                name: 'Total Planned US Points',
                group: 0
            },
            {
                type: 'column',
                data: total_accepted_us,
                visible: true,
                name: 'Total Accepted US Points',
                group: 1
            },
            {
                type: 'column',
                data: total_planned_de,
                visible: true,
                name: 'Total Planned DE Points',
                group: 0
            },
            {
                type: 'column',
                data: total_accepted_de,
                visible: true,
                name: 'Total Accepted DE Points',
                group: 1
            }
        ];
        return { series: series, categories: names };
    },
    _makeChart: function() {
        this.logger.log(this,"_makeChart");
        
        var size = Ext.Object.getSize(this._async_flags);
        if ( this._async_flags["defect"] === 1 || this._async_flags["story"] === 1 ) {
            // waiting for first run at defects and stories
        } else if ( size > 0 ) {
            this.logger.log(this,"Waiting for ", size, " searches to complete");
            this.down('#chart_box').removeAll();
            this.down('#selector_box').getEl().mask("Remaining to trace " + size);
        } else {
            this.down('#chart_box').removeAll();
            var chart_data = this._getChartData();
            this.down('#selector_box').getEl().unmask();
            
            if ( chart_data.categories.length === 0 ) {
                this.down('#chart_box').add({xtype:'container',padding: 10, html:'No Features found for selection.'});
            } else {
                this.down('#chart_box').add({
                    xtype:'rallychart',
                    chartData: {
                        categories: chart_data.categories,
                        series: chart_data.series
                    },
                    chartConfig: {
                        chart: { height: 600 },
                        title: { text: 'Feature Status', align: 'center' },
                        yAxis: [{
                            title: {
                                enabled: true,
                                text: 'Story Points',
                                style: { fontWeight: 'normal' }
                            }
                        }],
                        tooltip: {
                            shared: true,
                            valueSuffix: ' pts'
                        },
                        xAxis: [{
                            title: {
                                enabled: true,
                                text: 'Features'
                            },
                            categories: chart_data.categories,
                            labels: {
                                rotation: 90,
                                align: 'left'
                            }
                        }]
                    }
                });
            }
        }
    }
});